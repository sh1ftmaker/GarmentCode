// Human-friendly names and help text for GarmentCode parameters.
// Measurement definitions follow docs/Body Measurements GarmentCode.pdf.

export const MEASUREMENTS = {
  height: ['Height', 'From the feet to the top of the head.', 'Key'],
  bust: ['Bust', 'Circumference parallel to the floor through the bust points.', 'Key'],
  underbust: ['Underbust', 'Circumference parallel to the floor right below the bust.', 'Key'],
  waist: ['Waist', 'Circumference about midway between the ribs and the hip bones.', 'Key'],
  hips: ['Hips', 'Circumference parallel to the floor through the fullest part of the bottom.', 'Key'],
  shoulder_w: ['Shoulder width', 'From the outer end of the left collarbone to the outer end of the right one.', 'Upper body'],
  back_width: ['Back width (bust)', 'Back part of the bust circumference, side line to side line.', 'Upper body'],
  neck_w: ['Neck width', 'Width of the neck base, measured from the back between the side lines.', 'Upper body'],
  armscye_depth: ['Armhole depth', 'From the shoulder to the bottom of the underarm, measured on the back.', 'Upper body'],
  bust_points: ['Bust point distance', 'Distance between the two bust points.', 'Upper body'],
  bust_line: ['Shoulder to bust', 'Along the body from shoulder level to the bust points.', 'Upper body'],
  vert_bust_line: ['Neck to bust line', 'Vertical distance from the nape of the neck to the bust line.', 'Upper body'],
  waist_line: ['Nape to waist', 'Down the back from the nape of the neck to the waist.', 'Upper body'],
  waist_over_bust_line: ['Neck to waist over bust', 'From the neck base over the bust point down to the waistline.', 'Upper body'],
  shoulder_incl: ['Shoulder slope (°)', 'Angle of the line from the neck base to the end of the collarbone.', 'Upper body'],
  waist_back_width: ['Back waist width', 'Back part of the waist, side line to side line.', 'Lower body'],
  hip_back_width: ['Back hip width', 'Back part of the hips, side line to side line.', 'Lower body'],
  hips_line: ['Waist to hip', 'Vertical distance from the waistline to the hipline.', 'Lower body'],
  bum_points: ['Seat point distance', 'Distance between the two fullest points of the bottom.', 'Lower body'],
  crotch_hip_diff: ['Hip to crotch', 'Vertical distance from the hipline to the crotch.', 'Lower body'],
  hip_inclination: ['Hip slope (°)', 'Waist-to-hip angle on the side of the body (0 = vertical).', 'Lower body'],
  leg_circ: ['Thigh', 'Circumference of the thickest part of one thigh.', 'Limbs'],
  arm_length: ['Arm length', 'From the shoulder to the wrist.', 'Limbs'],
  wrist: ['Wrist', 'Circumference at the thinnest part of the arm, at the root of the hand.', 'Limbs'],
  head_l: ['Head length', 'From the nape of the neck to the top of the head.', 'Limbs'],
  arm_pose_angle: ['Arm pose (°)', 'Shoulder angle of the mannequin pose, used to align sleeves.', 'Advanced'],
};
export const MEASUREMENT_GROUPS = ['Key', 'Upper body', 'Lower body', 'Limbs', 'Advanced'];
export const ANGLE_KEYS = new Set(['shoulder_incl', 'hip_inclination', 'arm_pose_angle']);

export const GROUPS = {
  meta: 'Garment', waistband: 'Waistband', shirt: 'Bodice', collar: 'Neckline & collar', sleeve: 'Sleeves',
  left: 'Left side (asymmetry)', skirt: 'Skirt', 'flare-skirt': 'Flared skirt', 'godet-skirt': 'Godet skirt',
  'pencil-skirt': 'Pencil skirt', 'levels-skirt': 'Tiered skirt', pants: 'Pants', component: 'Collar piece',
  cuff: 'Cuff', 'skirt-many-panels': 'Panels', asymm: 'Asymmetry', cut: 'Cut-out',
};

export const PARAMS = {
  'meta.upper': ['Top', 'Upper garment'], 'meta.wb': ['Waistband', 'Waistband between top and bottom'],
  'meta.bottom': ['Bottom', 'Skirt or pants'],
  strapless: ['Strapless'], length: ['Length'], width: ['Width'], flare: ['Flare'], rise: ['Rise', 'How high the waist sits'],
  waist: ['Waist ease'], ruffle: ['Gathering'], suns: ['Fullness', 'Fraction of a full circle'],
  f_collar: ['Front neckline'], b_collar: ['Back neckline'], fc_depth: ['Front neck depth'], bc_depth: ['Back neck depth'],
  fc_angle: ['Front neck angle'], bc_angle: ['Back neck angle'], style: ['Style'], hood_depth: ['Hood depth'],
  hood_length: ['Hood length'], lapel_standing: ['Standing lapel'], depth: ['Depth'],
  sleeveless: ['Sleeveless'], armhole_shape: ['Armhole shape'], connecting_width: ['Sleeve cap width'],
  end_width: ['Opening width'], sleeve_angle: ['Sleeve angle'], opening_dir_mix: ['Opening direction'],
  standing_shoulder: ['Puffed shoulder'], standing_shoulder_len: ['Puff length'], connect_ruffle: ['Cap gathering'],
  smoothing_coeff: ['Cap smoothing'], type: ['Type'], top_ruffle: ['Top gathering'], cuff_len: ['Cuff length'],
  skirt_fraction: ['Skirt fraction'], skirt_flare: ['Skirt flare'], skirt_ruffle: ['Skirt gathering'],
  enable_asym: ['Asymmetric design', 'Design the left side separately'], bottom_cut: ['Hem cut'],
  n_panels: ['Number of panels'], panel_curve: ['Panel curve'], front_length: ['Front length'], add: ['Add cut-out'],
  place: ['Placement'], base: ['Base skirt'], insert_w: ['Insert width'], insert_depth: ['Insert depth'],
  num_inserts: ['Number of inserts'], cuts_distance: ['Insert spacing'], low_angle: ['Hem angle'],
  front_slit: ['Front slit'], back_slit: ['Back slit'], left_slit: ['Left slit'], right_slit: ['Right slit'],
  style_side_cut: ['Side cut-out'], level: ['Tier style'], num_levels: ['Number of tiers'],
  level_ruffle: ['Tier gathering'], base_length_frac: ['Base length'],
};

const VALUE_NAMES = {
  FittedShirt: 'Fitted bodice', Shirt: 'Loose shirt', StraightWB: 'Straight', FittedWB: 'Fitted',
  SkirtCircle: 'Circle skirt', AsymmSkirtCircle: 'Asymmetric circle skirt', GodetSkirt: 'Godet skirt', Pants: 'Pants',
  Skirt2: 'Straight skirt', SkirtManyPanels: 'Panelled skirt', PencilSkirt: 'Pencil skirt', SkirtLevels: 'Tiered skirt',
  CircleNeckHalf: 'Round', CurvyNeckHalf: 'Curvy', VNeckHalf: 'V-neck', SquareNeckHalf: 'Square',
  TrapezoidNeckHalf: 'Trapezoid', CircleArcNeckHalf: 'Arc', Bezier2NeckHalf: 'Custom curve',
  Turtle: 'Turtleneck', SimpleLapel: 'Lapel', Hood2Panels: 'Hood', ArmholeSquare: 'Square', ArmholeAngle: 'Angled',
  ArmholeCurve: 'Curved', CuffBand: 'Band', CuffSkirt: 'Flared', CuffBandSkirt: 'Band + flare',
  Sun: 'Sun', SIGGRAPH_logo: 'SIGGRAPH logo',
};

export const pretty = (k) => String(k).replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
export const groupName = (k) => GROUPS[k] || pretty(k);
export function paramName(path) {
  const full = path.join('.');
  const e = PARAMS[full] || PARAMS[path[path.length - 1]];
  return e ? e[0] : pretty(path[path.length - 1]);
}
export function paramHelp(path) {
  const e = PARAMS[path.join('.')] || PARAMS[path[path.length - 1]];
  return e && e[1] ? e[1] : '';
}
export const valueName = (v) => v === null ? 'None' : (VALUE_NAMES[v] || String(v));

// Parameters shown in "Essentials" mode (the rest stay under "All parameters")
export const ESSENTIAL = new Set(['meta.upper', 'meta.wb', 'meta.bottom', 'shirt.length', 'shirt.width', 'shirt.strapless',
  'collar.f_collar', 'collar.b_collar', 'collar.component.style', 'sleeve.sleeveless', 'sleeve.length', 'sleeve.end_width',
  'skirt.length', 'skirt.flare', 'flare-skirt.length', 'flare-skirt.suns', 'pencil-skirt.length', 'pencil-skirt.flare',
  'levels-skirt.num_levels', 'levels-skirt.length', 'godet-skirt.num_inserts', 'pants.length', 'pants.width', 'pants.flare',
  'waistband.width']);
