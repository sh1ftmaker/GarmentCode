"""Browser bridge for GarmentCode (runs inside Pyodide).

Wraps the original GarmentCode pattern generation (MetaGarment + pygarment)
and exports a JSON-friendly description of the sewing pattern that the
three.js front-end can mesh, place in 3D and drape.

This file is part of an unofficial web port and is not affiliated with the
original GarmentCode authors.
"""
import sys
import types
import json
import random
from copy import deepcopy

# --- Stub native-only / unused dependencies so pygarment imports in Pyodide ---
for _m in ['cairosvg', 'psutil', 'matplotlib', 'matplotlib.pyplot']:
    if _m not in sys.modules:
        sys.modules[_m] = types.ModuleType(_m)

import numpy as np
import yaml
import svgpathtools as svgpath

import pygarment as pyg
import pygarment.pattern.utils as pat_utils
from pygarment.pattern.rotation import euler_xyz_to_R
from assets.garment_programs.meta_garment import MetaGarment
from assets.bodies.body_params import BodyParameters

BODIES = {
    'neutral': './assets/bodies/mean_all.yaml',
    'female': './assets/bodies/mean_female.yaml',
    'male': './assets/bodies/mean_male.yaml',
}
DEFAULT_DESIGN = './assets/design_params/default.yaml'
START_DESIGN = './assets/design_params/t-shirt.yaml'


def _nested_sync(s_from, s_to):
    if 'v' in s_to:
        if 'v' in s_from:
            s_to['v'] = s_from['v']
    else:
        for key in s_to:
            if key in s_from:
                _nested_sync(s_from[key], s_to[key])


class WebGarment:
    def __init__(self):
        self.body_name = 'neutral'
        self.body = BodyParameters(BODIES['neutral'])
        self.design = {}
        self.sampler = pyg.DesignSampler()
        self.load_design_file(DEFAULT_DESIGN)
        try:
            with open(START_DESIGN, 'r') as f:
                self.load_design_yaml(f.read())
        except FileNotFoundError:
            pass
        self.initial = deepcopy(self.design)
        self.pattern = None
        self.garment = None

    # ---------------- parameters ----------------
    def load_design_file(self, path):
        with open(path, 'r') as f:
            des = yaml.safe_load(f)['design']
        self.design = deepcopy(des)
        self.sampler.load(path)
        self.sync_left()

    def load_design_yaml(self, text):
        des = yaml.safe_load(text)
        des = des.get('design', des)
        _nested_sync(des, self.design)
        self.sync_left()

    def sync_left(self):
        d = self.design
        if 'left' in d and not d['left']['enable_asym']['v']:
            for k in d['left']:
                if k != 'enable_asym' and k in d:
                    _nested_sync(d[k], d['left'][k])

    def set_param(self, path_json, value_json):
        path = json.loads(path_json)
        value = json.loads(value_json)
        node = self.design
        for k in path:
            node = node[k]
        node['v'] = value
        self.sync_left()

    def set_body(self, name):
        self.body_name = name
        self.body = BodyParameters(BODIES[name])

    def set_body_param(self, key, value):
        self.body.load_from_dict({key: float(value)})

    def randomize(self):
        for _ in range(20):  # avoid all-empty designs
            new = self.sampler.randomize()
            if any(new['meta'][k]['v'] for k in ('upper', 'wb', 'bottom')):
                break
        _nested_sync(new, self.design)
        self.sync_left()

    def reset(self):
        _nested_sync(self.initial, self.design)
        self.sync_left()

    def design_json(self):
        return json.dumps(self.design)

    def body_json(self):
        return json.dumps({k: float(v) for k, v in self.body.params.items()
                           if isinstance(v, (int, float))})

    def design_yaml(self):
        return yaml.dump({'design': self.design}, sort_keys=False)

    def body_yaml(self):
        return yaml.dump({'body': {k: float(v) for k, v in self.body.params.items()
                                   if isinstance(v, (int, float))}}, sort_keys=False)

    # ---------------- generation ----------------
    def generate(self, resolution=1.5):
        self.garment = MetaGarment('Configured_design', self.body, self.design)
        self.pattern = self.garment.assembly()
        try:
            intersecting = bool(self.garment.is_self_intersecting())
        except Exception:
            intersecting = False
        out = self._export(resolution)
        out['self_intersecting'] = intersecting
        return json.dumps(out)

    @staticmethod
    def _edge_curve(vertices, edge):
        """Same edge interpretation as pygarment.meshgen.boxmeshgen (3D frame, no y-flip)."""
        start = vertices[edge['endpoints'][0]]
        end = vertices[edge['endpoints'][1]]
        if 'curvature' in edge:
            curv = edge['curvature']
            if isinstance(curv, list) or curv['type'] == 'quadratic':
                cs = curv if isinstance(curv, list) else curv['params'][0]
                cp = pat_utils.rel_to_abs_2d(start, end, cs)
                return svgpath.QuadraticBezier(*pat_utils.list_to_c([start, cp, end]))
            if curv['type'] == 'circle':
                radius, large_arc, right = curv['params']
                return svgpath.Arc(pat_utils.list_to_c(start), radius + 1j * radius,
                                   rotation=0, large_arc=large_arc, sweep=right,
                                   end=pat_utils.list_to_c(end))
            if curv['type'] == 'cubic':
                cps = [pat_utils.rel_to_abs_2d(start, end, p) for p in curv['params']]
                return svgpath.CubicBezier(*pat_utils.list_to_c([start, *cps, end]))
        return svgpath.Line(*pat_utils.list_to_c([start, end]))

    def _export(self, res):
        spec = self.pattern.pattern
        panels = spec['panels']
        stitches = spec['stitches']

        curves, lengths = {}, {}
        for pname, p in panels.items():
            verts = np.asarray(p['vertices'], dtype=float)
            for ei, e in enumerate(p['edges']):
                c = self._edge_curve(verts, e)
                curves[(pname, ei)] = c
                try:
                    lengths[(pname, ei)] = float(c.length())
                except Exception:
                    lengths[(pname, ei)] = float(abs(c.end - c.start))

        # Number of segments per edge; stitched edges share the same count
        nseg = {k: max(1, int(np.ceil(l / res))) for k, l in lengths.items()}
        for _ in range(3):  # propagate through chains of stitches
            for s in stitches:
                a = (s[0]['panel'], s[0]['edge'])
                b = (s[1]['panel'], s[1]['edge'])
                if a in nseg and b in nseg:
                    n = max(nseg[a], nseg[b])
                    nseg[a] = nseg[b] = n

        out_panels = []
        edge_ranges = {}
        for pname, p in panels.items():
            loop, ranges = [], []
            n_edges = len(p['edges'])
            for ei in range(n_edges):
                c = curves[(pname, ei)]
                n = nseg[(pname, ei)]
                first = len(loop)
                for i in range(n):
                    z = c.point(i / n)
                    loop.append([float(z.real), float(z.imag)])
                ranges.append([first, n])
            total = len(loop)
            for ei, (first, n) in enumerate(ranges):
                edge_ranges[(pname, ei)] = [(first + i) % total for i in range(n + 1)]
            labels = {}
            for ei, e in enumerate(p['edges']):
                lab = e.get('label')
                if lab:
                    labels.setdefault(lab if isinstance(lab, str) else str(lab), []).extend(edge_ranges[(pname, ei)])
            R = np.asarray(euler_xyz_to_R(p['rotation'])).tolist()
            out_panels.append({
                'name': pname,
                'label': p.get('label', ''),
                'boundary': loop,
                'edge_ranges': [edge_ranges[(pname, ei)] for ei in range(n_edges)],
                'labels': labels,
                'rotation': R,
                'translation': [float(x) for x in p['translation']],
            })

        out_stitches = []
        for s in stitches:
            a = (s[0]['panel'], s[0]['edge'])
            b = (s[1]['panel'], s[1]['edge'])
            if a not in edge_ranges or b not in edge_ranges:
                continue
            ra, rb = list(edge_ranges[a]), list(edge_ranges[b])
            swap = not (len(s) == 3 and s[-1] == 'right_wrong')
            if swap:
                ra = ra[::-1]
            out_stitches.append({'a': a[0], 'b': b[0], 'ia': ra, 'ib': rb})

        # Attachment levels, as in pygarment.meshgen.garment (GarmentCode's Warp simulation setup)
        b = self.body.params
        levels = {
            'lower_interface': float(b.get('_waist_level', b['height'] - b['head_l'] - b['waist_line'])),
            'strapless_top': float(b['height'] - b['head_l'] - b['armscye_depth']),
        }
        neck_half = float((b['neck_w'] - 2) / 2)
        levels['right_collar'] = -neck_half   # x target, as in the original setup
        levels['left_collar'] = neck_half
        return {'panels': out_panels, 'stitches': out_stitches, 'attach_levels': levels}

    # ---------------- downloads ----------------
    def spec_json(self):
        if self.pattern is None:
            return '{}'
        return json.dumps({'pattern': self.pattern.pattern,
                           'properties': self.pattern.properties}, indent=2)

    def svg(self):
        if self.pattern is None or not self.pattern.pattern['panels']:
            return ''
        dwg = self.pattern.get_svg('/tmp/pattern.svg', with_text=True,
                                   view_ids=False, fill_panels=True, margin=2)
        return dwg.tostring()


gc = WebGarment()
