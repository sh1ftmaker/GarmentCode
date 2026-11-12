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

    def set_design(self, design_json):
        _nested_sync(json.loads(design_json), self.design)
        self.sync_left()

    def set_body_params(self, params_json):
        self.body.load_from_dict({k: float(v) for k, v in json.loads(params_json).items()})

    def preset_body(self, name):
        return json.dumps({k: float(v) for k, v in BodyParameters(BODIES[name]).params.items()
                           if isinstance(v, (int, float)) and not k.startswith('_')})

    def default_design_json(self):
        return json.dumps(self.initial)

    def randomize_locked(self, locked_json, max_tries=12):
        """Random design (locked parameters kept) that GarmentCode can draft cleanly.

        Like GarmentCode's own pattern randomizer (ParametrizedPattern._randomize_pattern),
        samples whose panels self-intersect (e.g. a deep round neckline bulging past the
        armhole) or that fail to draft are re-rolled.
        """
        for _ in range(max_tries):
            self._randomize_locked_once(locked_json)
            try:
                self._build()
            except Exception:
                continue
            if not self._intersecting_panels():
                return
        # give up: keep the last sample, the UI reports the problem

    def _randomize_locked_once(self, locked_json):
        locked = json.loads(locked_json)
        keep = {}
        for path in locked:
            node = self.design
            try:
                for k in path:
                    node = node[k]
                keep[tuple(path)] = deepcopy(node['v'])
            except (KeyError, TypeError):
                pass
        self.randomize()
        for path, v in keep.items():
            node = self.design
            for k in path:
                node = node[k]
            node['v'] = v
        self.sync_left()

    def pieces(self, res=0.5):
        """Fine outline of every panel for the cutting layout (no regeneration)."""
        if self.pattern is None:
            return json.dumps({'panels': [], 'stitches': []})
        return json.dumps(self._export(res))

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
    def _build_key(self):
        return json.dumps([self.design, {k: v for k, v in self.body.params.items()
                                         if isinstance(v, (int, float, str))}], sort_keys=True, default=str)

    def _build(self):
        key = self._build_key()
        if self.garment is not None and getattr(self, '_built_key', None) == key:
            return   # already drafted (e.g. while validating a random sample)
        self._built_key = None
        self.garment = MetaGarment('Configured_design', self.body, self.design)
        self.pattern = self.garment.assembly()
        self._built_key = key

    def _intersecting_panels(self):
        """Names of panels whose outline crosses itself (GarmentCode's own check)."""
        from pygarment.garmentcode.panel import Panel
        bad = []

        def walk(comp):
            for sub in comp._get_subcomponents():
                if isinstance(sub, Panel):
                    try:
                        if sub.is_self_intersecting():
                            bad.append(sub.name)
                    except Exception:
                        pass
                else:
                    walk(sub)
        walk(self.garment)
        return bad

    def generate(self, resolution=1.5):
        self._build()
        out = self._export(resolution)
        bad = self._intersecting_panels()
        out['self_intersecting'] = bool(bad)
        out['intersecting_panels'] = bad
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

    @staticmethod
    def _arc_samples(c, n):
        """n points (start included, end excluded) evenly spaced by arc length.

        Stitched edges are welded point-by-point, so both sides of a seam must be
        sampled at matching arc-length fractions; sampling by curve parameter makes
        the two sides disagree and the seam ripples."""
        if n <= 1 or isinstance(c, svgpath.Line):
            return [c.point(i / n) for i in range(n)]
        m = max(64, 16 * n)
        ts = np.linspace(0.0, 1.0, m + 1)
        pts = np.array([c.point(t) for t in ts])
        seg = np.abs(np.diff(pts))
        cum = np.concatenate([[0.0], np.cumsum(seg)])
        if cum[-1] <= 0:
            return [c.point(i / n) for i in range(n)]
        targets = cum[-1] * np.arange(n) / n
        t_at = np.interp(targets, cum, ts)
        return [c.point(float(t)) for t in t_at]

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
                for z in self._arc_samples(c, n):
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

    def svg(self, grains_json=''):
        """GarmentCode's pattern drawing; with grains ({panel: {vec: [x, y], mode}}, from
        the web app's grain.js) a grainline arrow is drawn on every panel."""
        if self.pattern is None or not self.pattern.pattern['panels']:
            return ''
        dwg = self.pattern.get_svg('/tmp/pattern.svg', with_text=True,
                                   view_ids=False, fill_panels=True, margin=2)
        grains = json.loads(grains_json) if grains_json else {}
        if grains:
            try:
                self._grain_arrows(dwg, grains)
            except Exception:   # the drawing without arrows is still useful
                pass
        return dwg.tostring()

    def _grain_arrows(self, dwg, grains):
        """Arrows placed exactly as get_svg places the panels (pygarment wrappers.py)."""
        from scipy.spatial.transform import Rotation
        pat = self.pattern
        names = [n for n in pat.panel_order() if n is not None]
        placed = {}
        for name in names:
            panel = pat.pattern['panels'][name]
            verts = np.asarray(panel['vertices'], dtype=float)
            v, tr = pat._verts_to_px_coords(verts.copy(), np.array(panel['translation'][:2], dtype=float))
            res = Rotation.from_euler('XYZ', panel['rotation'], degrees=True).apply([0, 1, 0])
            ang = np.rad2deg(pat_utils.vector_angle([0, 1], res[:2]))
            path, _, front = pat._draw_a_panel(name, apply_transform=True, fill=True)
            offset = np.min(verts * np.array([1, -1]), axis=0)

            def to_px(p, v0=v[0], ang=ang, tr=tr, offset=offset):
                z = complex(p[0] - offset[0], -p[1] - offset[1])
                z = (z - complex(*v0)) * np.exp(1j * np.deg2rad(-ang)) + complex(*v0)
                return z + complex(*tr)
            placed[name] = (path, front, to_px, verts)
        fronts = [p for p in placed.values() if p[1]]
        backs = [p for p in placed.values() if not p[1]]
        shift = 0
        if fronts and backs:
            shift = max(p[0].bbox()[1] for p in fronts) - min(p[0].bbox()[0] for p in backs) + 10
        for name, (path, front, to_px, verts) in placed.items():
            g = grains.get(name)
            if not g:
                continue
            gx, gy = g['vec']
            # direction on the drawing; arrow through the centre of the drawn panel
            u = to_px(np.array([gx, gy])) - to_px(np.array([0., 0.]))
            u = u / (abs(u) or 1.0)
            x0, x1, y0, y1 = path.bbox()
            mid = complex((x0 + x1) / 2, (y0 + y1) / 2) + (0 if front else shift)
            half = 0.3 * min((x1 - x0) / max(abs(u.real), 1e-6), (y1 - y0) / max(abs(u.imag), 1e-6))
            a, b = mid - u * half, mid + u * half
            L = 2 * half
            h = min(2.0, 0.15 * L)
            col = 'rgb(181,83,47)'
            grp = dwg.g(stroke=col, fill='none', stroke_width=0.35)
            grp.add(dwg.line((a.real, a.imag), (b.real, b.imag)))
            for tip, s in ((a, -1), (b, 1)):
                base = tip - s * u * h
                n = u * 1j * h * 0.5
                grp.add(dwg.polyline([((base + n).real, (base + n).imag), (tip.real, tip.imag), ((base - n).real, (base - n).imag)]))
            dwg.add(grp)
            if g.get('mode') == 'bias':
                m = (a + b) / 2 + u * 1j * 2.2
                dwg.add(dwg.text('bias', insert=(m.real, m.imag), fill=col, font_size='3', text_anchor='middle'))


gc = WebGarment()
