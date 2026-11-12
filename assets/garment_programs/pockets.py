"""Pockets for upper garments.

    NOTE: Addition of the unofficial web port of GarmentCode (not part of the
    original GarmentCode design space).

    GarmentCode only sews panels along their edges, so a pocket can't be
    top-stitched onto the face of a panel. A kangaroo (pouch) pocket is built
    from edge seams instead: the front torso half is split at the pocket's top
    into an upper and a lower front, and the pocket panel is sewn between them:

        * pocket top        <-> upper front, centre part of its bottom edge
        * lower front top   <-> upper front, side part (centre part stays free:
                                it is the inside of the pouch)
        * pocket bottom     -- part of the garment's hem (sewn to a hem band,
                                waistband or skirt, if any); the centre part of
                                the lower front's hem lies loose inside the pouch
        * pocket centre     <-> the other half's pocket centre
        * slanted sides     -- the pocket openings (free)
"""
import pygarment as pyg


class KangarooPocketPanel(pyg.Panel):
    """Half of a kangaroo pocket: trapezoid, wide at the hem, narrow at the top"""
    def __init__(self, name, height, bottom_w, top_w) -> None:
        super().__init__(name)
        self.edges = pyg.EdgeSeqFactory.from_verts(
            [0, 0], [-bottom_w, 0], [-top_w, height], [0, height], loop=True)
        self.interfaces = {
            'bottom': pyg.Interface(self, self.edges[0]),
            'opening': pyg.Interface(self, self.edges[1]),
            'top': pyg.Interface(self, self.edges[2]),
            'inside': pyg.Interface(self, self.edges[3]),
        }


def add_kangaroo_pocket(half, body, design):
    """Split the front torso panel of a (non-fitted) BodiceHalf and add half of a
    kangaroo pocket. Has to be called before sleeves and collars are cut in.

    Returns False (and changes nothing) if the pocket does not fit."""
    pdesign = design['shirt']['pocket']
    front = half.ftorso
    # Front torso half (tee.TorsoFrontHalfPanel): a quad with the centre front on x = 0
    # and the hem on y = 0. Its loop may have been reversed by autonorm, so find the
    # corners by position.
    if len(front.edges) != 4:
        return False   # unexpected panel shape
    verts = [list(e.start) for e in front.edges]
    centre = sorted([v for v in verts if abs(v[0]) < 1e-6], key=lambda v: v[1])
    outer = sorted([v for v in verts if v[0] < -1e-6], key=lambda v: v[1])
    if len(centre) != 2 or len(outer) != 2 or abs(centre[0][1]) > 1e-6 or abs(outer[0][1]) > 1e-6:
        return False
    (c0, n1), (s0, s1) = centre, outer

    ruffle = front.interfaces['bottom'].ruffle[0]['coeff']
    side_h = s1[1] - s0[1]
    # Keep the pocket well below the armhole
    max_h = side_h - design['sleeve']['connecting_width']['v'] - 5
    # ... and below the neckline (front depth is evaluated by BodiceHalf.eval_dep_params)
    max_h = min(max_h, n1[1] - design['collar']['fc_depth']['v'] - 10)
    height = min(pdesign['height']['v'] * body['waist_line'], max_h)
    if height < 8:
        return False
    x_h = s0[0] + (s1[0] - s0[0]) * height / side_h   # side seam at the pocket top
    # leave a strip of the lower front at the side (tiny edges upset seam matching)
    bottom_w = min(pdesign['width']['v'] * abs(s0[0]), abs(s0[0]) - 6)
    top_w = min(pdesign['top_width']['v'] * bottom_w, abs(x_h) - 6)
    if top_w < 3 or bottom_w < 6:
        return False

    # Upper front: same outline above the pocket top
    front.edges = pyg.EdgeSeqFactory.from_verts(
        [0, height], [-top_w, height], [x_h, height], list(s1), list(n1), loop=True)
    # Lower front (the inner layer of the pouch)
    lower = pyg.Panel(f'{front.name}_lower')
    lower.edges = pyg.EdgeSeqFactory.from_verts(
        [0, 0], [-bottom_w, 0], list(s0), [x_h, height], [-top_w, height], [0, height],
        loop=True)
    pocket = KangarooPocketPanel(
        f'{half.name}_pocket', height, bottom_w, top_w)

    for p in (lower, pocket):
        p.translation = front.translation.copy()
        p.rotation = front.rotation
    pocket.translate_by([0, 0, 3])   # on top of the lower front

    fe, le = front.edges, lower.edges
    front.interfaces = {
        'outside': pyg.Interface.from_multiple(
            pyg.Interface(lower, le[2]), pyg.Interface(front, fe[2])),
        'inside': pyg.Interface.from_multiple(
            pyg.Interface(front, fe[4]), pyg.Interface(lower, le[5])),
        'shoulder': pyg.Interface(front, fe[3]),
        'bottom': pyg.Interface.from_multiple(
            pyg.Interface(pocket, pocket.interfaces['bottom'].edges, ruffle=ruffle),
            pyg.Interface(lower, le[1], ruffle=ruffle)),
        'shoulder_corner': pyg.Interface(front, [fe[2], fe[3]]),
        'collar_corner': pyg.Interface(front, [fe[3], fe[4]]),
    }
    half.stitching_rules.append((pyg.Interface(front, fe[0]), pocket.interfaces['top']))
    half.stitching_rules.append((pyg.Interface(front, fe[1]), pyg.Interface(lower, le[3])))

    # Interfaces above list their edges in the panel's original (canonical) order;
    # only edge directions are affected by the right/wrong side update
    for p in (front, lower, pocket):
        p.autonorm()

    half.f_lower = lower
    half.pocket = pocket
    half.interfaces.update({
        'f_bottom': front.interfaces['bottom'],
        'front_in': front.interfaces['inside'],
        'pocket_in': pocket.interfaces['inside'],
    })
    return True
