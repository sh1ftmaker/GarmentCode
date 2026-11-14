# GarmentCode 3D — unofficial web configurator (fork)

> [!IMPORTANT]
> **This is an unofficial, community fork. We are not affiliated with, endorsed by, or supported by the original GarmentCode authors, ETH Zürich, or the Interactive Geometry Lab.**
> All credit for GarmentCode, PyGarment, the garment programs and the body models goes to the original authors — see the [original repository](https://github.com/maria-korosteleva/GarmentCode) and the [citation](#citation) section below. For the official online demo, go to https://garmentcode.ethz.ch/. Please do not report issues with this fork to the original authors.

**Live demo: https://sh1ftmaker.github.io/GarmentCode/**

This fork adds **GarmentCode 3D Studio**, a static, browser-only web app (in [`web/`](web/)) hosted on GitHub Pages. No server is needed, and nothing leaves your device.

**Design**
* The original GarmentCode Python (`pygarment` + `assets/garment_programs`) runs unchanged in [Pyodide](https://pyodide.org/) inside a Web Worker.
* A design gallery (categories, search, GarmentCode / FreeSewing and 3D filters, recently used designs), plain-language parameter names, an Essentials/All switch, search, and "Surprise me" randomisation with per-parameter locks.
* **Sketchbook**: a step-by-step mix-and-match builder for GarmentCode designs (top, neckline, collar or hood, sleeves, cuffs, waistband, bottom, extras), each choice a card with a small drawing; the full parameter list stays below it to fine-tune.
* **My designs**: a library of saved designs with thumbnails (in the gallery), with rename, duplicate, delete, and import/export as `.gcdesign.json` files. Undo/redo, share links (the design is compressed into the URL) and autosave. Everything is stored in your browser.

**Draft: your own patterns** ([`web/src/workshop/`](web/src/workshop/))
* A pattern editor on a cutting mat, drawn over the mannequin seen from the front or the back, in real centimetres and in GarmentCode's body frame, so pieces are drawn where they sit on the body.
* Draw pieces point by point; drag points, edges (to curve them) and whole pieces; add and delete points; straight, curved and S-shaped edges.
* Any point can follow the body: type a formula like `waist / 4 + ease` using the body measurements, landmark heights (`waist_y`, `hip_y`, `shoulder_y`, ...) and the pattern's own numbers. Points drawn with the mouse are graded from the body they were drawn on (landmark heights and girths), so they follow measurement changes too.
* Mirrored left/right pairs, pieces cut on the fold, single pieces and cut-only pieces (pockets, facings); grain direction and rib knit per piece; edges that hold the garment at the waist, under the arms or at the neck.
* The Sew tool joins edges (also several edges in a row, and a piece to its own mirror copy); seams are numbered and checked for length.
* Start from a measurement-driven block (A-line skirt, boxy T-shirt, shift dress), a blank board, or a copy of the current GarmentCode design.
* Your pattern drapes live beside the board, and gets the same cutting layout, PDF/SVG/DXF exports, undo, share links and saving as every other design. Pattern files download as `.pattern.json`.

**FreeSewing designs**
* Besides GarmentCode's programs, the app includes the whole [FreeSewing](https://freesewing.eu) collection (MIT, by Joost De Cock and contributors): 72 designs by Joost De Cock and many other designers, each credited in the app's gallery. Every design drafts from your measurements and gets its pattern, a cutting layout (per material: fabric, lining, interfacing, ribbing) and the exports.
* 54 of them also drape in 3D, nearly every garment: Bruce, Hugo, Teagan, Sven, Aaron, Simon, Charlie, Uma, Brian, Huey, Wahid, Shin, Bent, Jaeger, Paco, Tamiko (Joost De Cock); Penelope, Waralee, Lumira, Lumina, Crux, Noble, Otis, Devon (Wouter Van Wageningen); Toni, Hannah, Bibi, Shale, Sabrina (Jonathan Haas); Shelly, Onyx, Opal (Thrunic); Walburga, Tiberius, Lunetius (Rika Tamaike); Carlton, Carlita (Anneke Caramin and Joost De Cock); Lily, Sasha (Anna Puk); Titan (Debra Bean and Joost De Cock); Yuri (Biou); Tristan (Natalia Sayang); Sarah (Timur Duehr); Sandy (Erica Alcusa Sáez); Sunny (halbmoki); Umbra (Joost De Cock and Jonathan Haas); Bella (Bella Incognito and Joost De Cock); Bee (PrudenceRabbit); Cathrin (Cathrin Åhlén and Joost De Cock); Jett (Candle); Percy (Gawain/Candle); Ashley (Gawain CCBR); Jane (SeaZeeZee); Sophie (JenBarb_). The others are marked "Pattern": Diana, Tina, Breanna and Cornelius (their drape doesn't look like the design yet), plus the accessories, toys and costumes. FreeSewing describes each piece's outline and cut list but not which edges are sewn together, so draping a design needs a small adapter. Some simplifications are explained in each design's note in the app (e.g. collars and lapels of the tailored jackets are cut but not simulated; stretch designs drape a relaxed copy).
* FreeSewing's own code drafts the pattern in your browser (bundled from `@freesewing/*` at build time). The app maps GarmentCode body measurements to FreeSewing's (girths and lengths GarmentCode doesn't have, such as `hips` at the top of the hip bone, the biceps, head, knee, ankle and the crotch seam, are measured on the mannequin; [`web/src/fs/measure.js`](web/src/fs/measure.js)), shows the design's options as sliders, and converts the draft into sewn, placed panels ([`web/src/fs/`](web/src/fs/)).
* Pieces start on body-hugging guide surfaces ([`web/src/fs/place.js`](web/src/fs/place.js)): bodices around the torso and over the shoulders, sleeves around the arms, the hood beside the head; sleeve caps, hoods, waistbands and cuffs are then snapped onto the edges they are sewn to.
* Stretch designs (Bruce, Aaron, the ribbing of Hugo and Sven) are drafted with negative ease. The cloth simulation barely stretches, so the drape uses a relaxed copy (for Bruce: no negative ease at the hips, a third of it at the legs; ribbing unstretched). The pattern view, cutting layout and exports use the real pattern. Patch pockets and bindings are cut but not simulated.
* Draping another design takes a small adapter (options, seam table, placement); see [`web/src/fs/titan.js`](web/src/fs/titan.js) for a lower-body design and [`web/src/fs/hugo.js`](web/src/fs/hugo.js) for a top. Designs without one are cut generically ([`web/src/fs/generic.js`](web/src/fs/generic.js)). After upgrading `@freesewing/*`, run `node web/tools/gen_fs_catalog.mjs` to regenerate the catalogue, option lists and thumbnails.

**Body**
* Enter GarmentCode's 26 body measurements (cm or inches). The pattern is re-drafted to fit, and the mannequin morphs to match: height, landmark lines, bust/underbust/waist/hip girths, shoulders, arms and thighs, blended with GarmentCode's body segmentation.
* Saved body profiles. YAML import and export compatible with GarmentCode.

**3D drape** ([three.js](https://threejs.org/))
* A small XPBD cloth solver modelled on GarmentCode's simulation setup:
  * stitched vertices are welded, as in GarmentCode's BoxMesh;
  * gentle half-space attachments at the waist, the top of strapless garments and the neckline;
  * skirts and pants don't collide with the arms;
  * zero gravity for the first frames, a velocity clamp, and the drape stops once the cloth settles.
* To start close to the body, panels are pre-wrapped around the torso or arm axis before sewing.
* Fabric presets (cotton, jersey, linen, denim, silk, chiffon), colours and prints.
* A fit map showing tight and loose areas.

**Cutting**
* Pattern pieces with seam allowance, notches, seam numbers and grainlines.
* Automatic layout on your fabric width; drag to adjust, tap to rotate.
* Fabric to buy, and a generated sewing order.
* Exports:
  * printable tiled PDF on A4 or US Letter, with a test square and an assembly map;
  * full-size layout PDF;
  * SVG and DXF;
  * GarmentCode's own pattern SVG and JSON;
  * the draped garment as GLB or OBJ;
  * a turntable video and a screenshot.

It installs as an app (PWA) and caches itself for offline use after the first visit.

### Limitations

The drape is a lightweight real-time approximation, **not** the NVIDIA Warp simulator used by GarmentCode/GarmentCodeData. Cloth self-collision is approximate (layered pieces can still overlap), and fabric behaviour is simplified. Patterns drawn in Draft drape with the same simulator: pieces are wrapped around the body or arm from where they are drawn, so very unusual shapes may need a few tries. Some designs, especially strapless and close-fitting tops, may settle lower than intended. The mannequin morph is an approximate regional deformation, not a statistical body model. Extreme measurements will look stylised, and the morph doesn't model posture or body shape beyond the listed measurements. Use the original pipeline for research-quality results.

### Run locally

```bash
cd web && npm install          # three + three-mesh-bvh (body data), esbuild + @freesewing/* (FreeSewing bundle)
npm run build                  # assembles ../_site (Python sources zip, body meshes, collision fields)
npm run serve                  # http://localhost:8000
```

Deployment happens through [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`. The repository's Pages source must be set to "GitHub Actions".

### What's changed vs. upstream

Additions: `web/`, `.github/workflows/pages.yml`, `.gitignore` entries and this README section. One fix in the Python library: `Interface.reverse()` in `pygarment/garmentcode/interface.py` now also reverses the order of multi-section seam lengths (it made the hoodie's right hem band sewn on backwards). The garment programs are untouched. The web port is distributed under the same MIT license as the original project. FreeSewing designs are MIT licensed by their authors (https://freesewing.eu); the bundle keeps their license notices.

---

*The original README follows.*

# GarmentCode: Programming Parametric Sewing Patterns

![Examples of garments sampled from GarmentCode configurator](https://github.com/maria-korosteleva/GarmentCode/raw/main/assets/img/header.png)

Official Implementation of [GarmentCode: Programming Parametric Sewing Patterns](https://igl.ethz.ch/projects/garmentcode/) and [GarmentCodeData: A Dataset of 3D Made-to-Measure Garments With Sewing Patterns](https://igl.ethz.ch/projects/GarmentCodeData/).

> You can find the body measurements part of the project here: https://github.com/mbotsch/GarmentMeasurements 

## News

**[June 3, 2025]** GarmentCode online configurator demo is back online 🥳

**[April, 2025]** GarmentCode online configurator demo is temporarily unavailable. We are working on bringing it back online!

**[Nov 20, 2024]** GarmentCode configurator demo is now ONLINE 🥳 Check it out: https://garmentcode.ethz.ch/ (not for mobile) 

**[Sept 4, 2024]** We release a new version of the dataset with a few fixes and updates: [GarmentCodeData (v2)](https://doi.org/10.3929/ethz-b-000690432). See documentation for new data version for more details.

**[Aug 30, 2024]** Major release -- implementation of [GarmentCodeData](https://igl.ethz.ch/projects/GarmentCodeData/) in `pygarment v2.0.0`, new GUI, and other updates and improvements. Basic JSON representation classes are now part of PyGarment library! See CHANGELOG for more details

**[July 1, 2024]** [GarmentCodeData](https://igl.ethz.ch/projects/GarmentCodeData/) is accepted to ECCV!

**[May 29, 2024]** First release of [GarmentCodeData](https://doi.org/10.3929/ethz-b-000673889) dataset!

**[Oct 18, 2023]** First release of GarmentCode!

## Documents

1. [Installation](https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Installation.md)
2. [Running Configurator](https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Running_garmentcode.md) 
3. [Running Data Generation (warp)](https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Running_data_generation.md) 
3. [Body measurements](https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Body%20Measurements%20GarmentCode.pdf)
4. [Dataset documentation](https://www.research-collection.ethz.ch/handle/20.500.11850/673889)
3. [Running Old Maya+Qualoth tools](https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Running_Maya_Qualoth.md) 

## Navigation

### Library

[PyGarment](https://github.com/maria-korosteleva/GarmentCode/tree/main/pygarment) is the core library described in the GarmentCode paper. It contains the base types (Edge, Panel, Component, Interface, etc.), as well as edge factory and various helpers and operators that help you design sewing patterns.  

See [Installation instructions](https://github.com/maria-korosteleva/GarmentCode/tree/main/docs/Installation.md) before use.

### Examples

* [assets/garment_programs/](https://github.com/maria-korosteleva/GarmentCode/tree/main/assets/garment_programs/) contains the code of garment components designed using PyGarment. 
* [assets/design_params/](https://github.com/maria-korosteleva/GarmentCode/tree/main/assets/design_params/), [assets/bodies/](https://github.com/maria-korosteleva/GarmentCode/tree/main/assets/bodies/) contain examples of design and body measurements presets. They can be used in both GarmentCode GUI and `test_garmentcode.py` script.

> NOTE: [assets/design_params/default.yaml](https://github.com/maria-korosteleva/GarmentCode/blob/main/assets/design_params/default.yaml) is the setup used by GUI on load. Changing this file results in changes in the GUI initial state =) 


## Citation

If you are using our system in your research, please cite our papers:

```bibtex
@inproceedings{GarmentCodeData:2024,
  author = {Korosteleva, Maria and Kesdogan, Timur Levent and Kemper, Fabian and Wenninger, Stephan and Koller, Jasmin and Zhang, Yuhan and Botsch, Mario and Sorkine-Hornung, Olga},
  title = {{GarmentCodeData}: A Dataset of 3{D} Made-to-Measure Garments With Sewing Patterns},
  booktitle={Computer Vision -- ECCV 2024},
  year = {2024},
  keywords = {sewing patterns, garment reconstruction, dataset},
}
```

```bibtex
@article{GarmentCode2023,
  author = {Korosteleva, Maria and Sorkine-Hornung, Olga},
  title = {{GarmentCode}: Programming Parametric Sewing Patterns},
  year = {2023},
  issue_date = {December 2023},
  publisher = {Association for Computing Machinery},
  address = {New York, NY, USA},
  volume = {42},
  number = {6},
  doi = {10.1145/3618351},
  journal = {ACM Transaction on Graphics},
  note = {SIGGRAPH ASIA 2023 issue},
  numpages = {16},
  keywords = {sewing patterns, garment modeling}
}
```

## Issues, questions, suggestions

Please post your issues and questions to [GitHub Issues](https://github.com/maria-korosteleva/GarmentCode/issues).

For other requests you can find my info on https://korosteleva.com/.  

## Contributors

This project is brought to life by these people:

* [Maria Korosteleva](https://github.com/maria-korosteleva)
* [Jasmin Koller](https://github.com/JasminKoller)
* [Yuhan Zhang](https://github.com/yuhan-zh)
* [Yuhan Liu](https://github.com/yuhanliu-tech)
* [Ami Beuret](https://github.com/amibeuret)
* [Olga Sorkine-Hornung](https://igl.ethz.ch/people/sorkine/index.php)

The body measurements team developed [GarmentMeasurements](https://github.com/mbotsch/GarmentMeasurements): 
* [Fabian Kemper](https://github.com/fabiankemper)
* [Stephan Wenninger](https://github.com/stephan-wenninger)
* [Mario Botsch](https://github.com/mbotsch)
