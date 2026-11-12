import pygarment as pyg
from assets.garment_programs.circle_skirt import CircleArcPanel
from assets.garment_programs import skirt_paneled
from assets.garment_programs.base_classes import BaseBand

class StraightBandPanel(pyg.Panel):
    """One panel for a panel skirt"""

    def __init__(self, name, width, depth, match_int_proportion=None) -> None:
        super().__init__(name)

        # define edge loop
        self.edges = pyg.EdgeSeqFactory.from_verts(
            [0, 0], [0, depth], [width, depth], [width, 0], loop=True)

        # define interface
        self.interfaces = {
            'right': pyg.Interface(self, self.edges[0]),
            'top': pyg.Interface(self, 
                                 self.edges[1], 
                                 ruffle=width / match_int_proportion if match_int_proportion is not None else 1.
                                 ).reverse(True),
            'left': pyg.Interface(self, self.edges[2]),
            'bottom': pyg.Interface(self, 
                                    self.edges[3], 
                                    ruffle=width / match_int_proportion if match_int_proportion is not None else 1.
                                    )
        }

        # Default translation
        self.top_center_pivot()
        self.center_x()


class StraightWB(BaseBand):
    """Simple 2 panel waistband"""
    def __init__(self, body, design, rise=1.) -> None:
        """Simple 2 panel waistband

            * rise -- the rise value of the bottoms that the WB is attached to 
                Adapts the shape of the waistband to sit tight on top 
                of the given rise level (top measurement). If 1. or anything less than waistband width, 
                the rise is ignored and the StraightWB is created to sit well on the waist
        
        """
        super().__init__(body, design, rise=rise)

        # Measurements
        self.waist = design['waistband']['waist']['v'] * body['waist']
        self.waist_back_frac = body['waist_back_width'] / body['waist']
        self.hips = body['hips'] * design['waistband']['waist']['v']
        self.hips_back_frac = body['hip_back_width'] / body['hips']

        # Params
        self.width = design['waistband']['width']['v'] 
        self.rise = rise
        # Check correct values
        if self.rise + self.width > 1:
            self.rise = 1 - self.width

        self.top_width = pyg.utils.lin_interpolation(
            self.hips, self.waist, self.rise + self.width)
        self.top_back_fraction = pyg.utils.lin_interpolation(
            self.hips_back_frac, self.waist_back_frac, self.rise + self.width)
        
        self.width = self.width * body['hips_line']

        self.define_panels()

        self.front.translate_by([0, body['_waist_level'], 20])
        self.back.translate_by([0, body['_waist_level'], -15]) 
        
        self.stitching_rules = pyg.Stitches(
            (self.front.interfaces['right'], self.back.interfaces['right']),
            (self.front.interfaces['left'], self.back.interfaces['left'])
        )

        self.interfaces = {
            'bottom_f': self.front.interfaces['bottom'],  
            'bottom_b': self.back.interfaces['bottom'],

            'top_f': self.front.interfaces['top'],
            'top_b': self.back.interfaces['top'],

            'bottom': pyg.Interface.from_multiple(
                self.front.interfaces['bottom'],
                self.back.interfaces['bottom']),
            'top': pyg.Interface.from_multiple(
                self.front.interfaces['top'], 
                self.back.interfaces['top']),
        }

    def define_panels(self):
        back_width = self.top_width * self.top_back_fraction

        self.front = StraightBandPanel(
            'wb_front', 
            self.top_width - back_width, 
            self.width,
            match_int_proportion=self.body['waist'] - self.body['waist_back_width']
        )
          
        self.back = StraightBandPanel(
            'wb_back', 
            back_width, 
            self.width,
            match_int_proportion=self.body['waist_back_width']
        )


class FittedWB(StraightWB):
    """Also known as Yoke: a waistband that ~follows the body curvature,
            and hence sits tight
        Made out of two circular arc panels
    """
    def __init__(self, body, design, rise=1.) -> None:
        """A waistband that ~follows the body curvature, and hence sits tight
        
            * rise -- the rise value of the bottoms that the WB is attached to 
                Adapts the shape of the waistband to sit tight on top 
                of the given rise level. If 1. or anything less than waistband width, 
                the rise is ignored and the FittedWB is created to sit well on the waist
        """
        self.bottom_width = None
        self.bottom_back_fraction = None
        super().__init__(body, design, rise)

    def define_panels(self):
        self.bottom_width = pyg.utils.lin_interpolation(
            self.hips, self.waist, self.rise)
        self.bottom_back_fraction = pyg.utils.lin_interpolation(
            self.hips_back_frac, self.waist_back_frac, self.rise)
        
        self.front = CircleArcPanel.from_all_length(
            'wb_front', 
            self.width, 
            self.top_width * (1 - self.top_back_fraction), 
            self.bottom_width * (1 - self.bottom_back_fraction),
            match_top_int_proportion=self.body['waist'] - self.body['waist_back_width'],
            match_bottom_int_proportion=self.body['waist'] - self.body['waist_back_width']
        )
        
        self.back = CircleArcPanel.from_all_length(
            'wb_back', 
            self.width, 
            self.top_width * self.top_back_fraction, 
            self.bottom_width * self.bottom_back_fraction,
            match_top_int_proportion=self.body['waist_back_width'],
            match_bottom_int_proportion=self.body['waist_back_width']
        )


class CuffBand(BaseBand):
    """ Cuff class for sleeves or pants
        band-like piece of fabric with optional "skirt"
    """
    def __init__(self, tag, design, length=None) -> None:
        super().__init__(body=None, design=design, tag=tag)

        self.design = design['cuff']

        if length is None:
            length = self.design['cuff_len']['v']

        self.front = StraightBandPanel(
            f'{tag}_cuff_f', self.design['b_width']['v'] / 2, length)
        self.front.translate_by([0, 0, 15])  
        self.back = StraightBandPanel(
            f'{tag}_cuff_b', self.design['b_width']['v'] / 2, length)
        self.back.translate_by([0, 0, -15])  

        self.stitching_rules = pyg.Stitches(
            (self.front.interfaces['right'], self.back.interfaces['right']),
            (self.front.interfaces['left'], self.back.interfaces['left'])
        )

        self.interfaces = {
            'bottom': pyg.Interface.from_multiple(
                self.front.interfaces['bottom'], 
                self.back.interfaces['bottom']),
            'top_front': self.front.interfaces['top'],
            'top_back': self.back.interfaces['top'],
            'top': pyg.Interface.from_multiple(
                self.front.interfaces['top'], 
                self.back.interfaces['top']),
        }


class CuffSkirt(BaseBand):
    """A skirt-like flared cuff """

    def __init__(self, tag, design, length=None) -> None:
        super().__init__(body=None, design=design, tag=tag)

        self.design = design['cuff']
        width = self.design['b_width']['v']
        flare_diff = (self.design['skirt_flare']['v'] - 1) * width / 2

        if length is None:
            length = self.design['cuff_len']['v']

        self.front = skirt_paneled.SkirtPanel(
            f'{tag}_cuff_skirt_f', ruffles=self.design['skirt_ruffle']['v'], 
            waist_length=width / 2, length=length, 
            flare=flare_diff)
        self.front.translate_by([0, 0, 15])  
        self.back = skirt_paneled.SkirtPanel(
            f'{tag}_cuff_skirt_b', ruffles=self.design['skirt_ruffle']['v'], 
            waist_length=width / 2, length=length, 
            flare=flare_diff)
        self.back.translate_by([0, 0, -15])  

        self.stitching_rules = pyg.Stitches(
            (self.front.interfaces['right'], self.back.interfaces['right']),
            (self.front.interfaces['left'], self.back.interfaces['left'])
        )

        self.interfaces = {
            'top': pyg.Interface.from_multiple(
                self.front.interfaces['top'], self.back.interfaces['top']),
            'top_front': self.front.interfaces['top'],
            'top_back': self.back.interfaces['top'],
            'bottom': pyg.Interface.from_multiple(
                self.front.interfaces['bottom'], 
                self.back.interfaces['bottom']),
        }


class CuffBandSkirt(pyg.Component):
    """ Cuff class for sleeves or pants
        band-like piece of fabric with optional "skirt"
    """
    def __init__(self, tag, design) -> None:
        super().__init__(self.__class__.__name__)

        self.cuff = CuffBand(
            tag, 
            design, 
            length=design['cuff']['cuff_len']['v'] * (1 - design['cuff']['skirt_fraction']['v'])
        )
        self.skirt = CuffSkirt(
            tag, 
            design, 
            length=design['cuff']['cuff_len']['v'] * design['cuff']['skirt_fraction']['v']
        )

        # Align
        self.skirt.place_below(self.cuff)

        self.stitching_rules = pyg.Stitches(
            (self.cuff.interfaces['bottom'], self.skirt.interfaces['top']),
        )

        self.interfaces = {
            'top': self.cuff.interfaces['top'],
            'top_front': self.cuff.interfaces['top_front'],
            'top_back': self.cuff.interfaces['top_back'],
            'bottom': self.skirt.interfaces['bottom']
        }

    def length(self):
        return self.cuff.length() + self.skirt.length()


class HemBand(BaseBand):
    """Ribbed hem band of an upper garment (e.g. a hoodie or a sweatshirt)

        A straight two-panel band, like StraightWB, sewn to the bottom of the
        garment. Its circumference is a fraction of the garment's hem, so the
        hem gathers into the band, but never smaller than the body at the
        level where the band sits.

        NOTE: Addition of the unofficial web port (not part of the original
        GarmentCode design space).
    """
    def __init__(self, body, design, hem_length, level, split_front=False) -> None:
        """
            * hem_length -- length of the hem the band is sewn to
            * level -- distance from the shoulder line to the top of the band
            * split_front -- front band in two halves (for open-front garments)
        """
        super().__init__(body, design, tag='hem')

        bdesign = design['shirt']['hem_band']
        self.width = bdesign['depth']['v'] * body['hips_line']

        # Body circumference at the band level (between waist and hips)
        bottom_level = level + self.width
        if bottom_level <= body['waist_line']:
            min_circ = body['waist']
        else:
            min_circ = pyg.utils.lin_interpolation(
                body['waist'], body['hips'],
                min(1., (bottom_level - body['waist_line']) / body['hips_line']))
        min_circ = max(min_circ, body['waist'])
        circ = max(bdesign['fit']['v'] * hem_length, min_circ)

        # Front/back split as in the garment's hem (it is matched to the waist)
        back_frac = body['waist_back_width'] / body['waist']
        front_w = circ * (1 - back_frac)
        front_match = body['waist'] - body['waist_back_width']
        self.back = StraightBandPanel(
            'hem_band_back', circ * back_frac, self.width,
            match_int_proportion=body['waist_back_width'])
        self.back.translate_by([0, body['_waist_level'], -15])

        if not split_front:
            self.front = StraightBandPanel(
                'hem_band_front', front_w, self.width, match_int_proportion=front_match)
            self.front.translate_by([0, body['_waist_level'], 20])
            fronts = [self.front]
            self.stitching_rules = pyg.Stitches(
                (self.front.interfaces['right'], self.back.interfaces['right']),
                (self.front.interfaces['left'], self.back.interfaces['left'])
            )
        else:
            # Halves in the order the garment's hem runs (right half first)
            self.front_l = StraightBandPanel(
                'hem_band_front_l', front_w / 2, self.width, match_int_proportion=front_match / 2)
            self.front_l.translate_by([front_w / 4, body['_waist_level'], 20])
            self.front_r = StraightBandPanel(
                'hem_band_front_r', front_w / 2, self.width, match_int_proportion=front_match / 2)
            self.front_r.translate_by([-front_w / 4, body['_waist_level'], 20])
            fronts = [self.front_r, self.front_l]
            self.stitching_rules = pyg.Stitches(
                (self.front_r.interfaces['right'], self.back.interfaces['right']),
                (self.front_l.interfaces['left'], self.back.interfaces['left'])
            )

        self.interfaces = {
            'top': pyg.Interface.from_multiple(
                *[f.interfaces['top'] for f in fronts], self.back.interfaces['top']),
            'bottom': pyg.Interface.from_multiple(
                *[f.interfaces['bottom'] for f in fronts], self.back.interfaces['bottom']),
        }

    def length(self):
        return self.width