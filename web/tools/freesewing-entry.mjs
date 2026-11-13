/*! FreeSewing designs for GarmentCode 3D Studio (bundled by web/tools/build_site.sh).
 *
 * @freesewing/core, the @freesewing/* designs (bruce, hugo, ...) and their @freesewing/* plugins
 *   https://freesewing.eu - MIT License, Copyright (c) Joost De Cock and contributors
 *   (@freesewing/plugin-transform: Wouter van Wageningen)
 * bezier-js - MIT License, Copyright (c) Pomax
 * hooks - MIT License, Copyright (c) Brian Noguchi
 * lodash.clonedeep, lodash.get, lodash.set, lodash.unset - MIT License,
 *   Copyright OpenJS Foundation and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following
 * conditions: The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */
// Every FreeSewing design, each in its own chunk (esbuild --splitting), loaded on first use.
// The list matches src/fs/catalog.js (tools/gen_fs_catalog.mjs).
export { version } from '@freesewing/core';
const loaders = {
  aaron: () => import('@freesewing/aaron').then((m) => m.Aaron),
  albert: () => import('@freesewing/albert').then((m) => m.Albert),
  ashley: () => import('@freesewing/ashley').then((m) => m.Ashley),
  bee: () => import('@freesewing/bee').then((m) => m.Bee),
  bella: () => import('@freesewing/bella').then((m) => m.Bella),
  benjamin: () => import('@freesewing/benjamin').then((m) => m.Benjamin),
  bent: () => import('@freesewing/bent').then((m) => m.Bent),
  bibi: () => import('@freesewing/bibi').then((m) => m.Bibi),
  bob: () => import('@freesewing/bob').then((m) => m.Bob),
  breanna: () => import('@freesewing/breanna').then((m) => m.Breanna),
  brian: () => import('@freesewing/brian').then((m) => m.Brian),
  bruce: () => import('@freesewing/bruce').then((m) => m.Bruce),
  carlita: () => import('@freesewing/carlita').then((m) => m.Carlita),
  carlton: () => import('@freesewing/carlton').then((m) => m.Carlton),
  cathrin: () => import('@freesewing/cathrin').then((m) => m.Cathrin),
  charlie: () => import('@freesewing/charlie').then((m) => m.Charlie),
  cornelius: () => import('@freesewing/cornelius').then((m) => m.Cornelius),
  crux: () => import('@freesewing/crux').then((m) => m.Crux),
  devon: () => import('@freesewing/devon').then((m) => m.Devon),
  diana: () => import('@freesewing/diana').then((m) => m.Diana),
  florence: () => import('@freesewing/florence').then((m) => m.Florence),
  florent: () => import('@freesewing/florent').then((m) => m.Florent),
  gozer: () => import('@freesewing/gozer').then((m) => m.Gozer),
  hannah: () => import('@freesewing/hannah').then((m) => m.Hannah),
  hi: () => import('@freesewing/hi').then((m) => m.Hi),
  holmes: () => import('@freesewing/holmes').then((m) => m.Holmes),
  hortensia: () => import('@freesewing/hortensia').then((m) => m.Hortensia),
  huey: () => import('@freesewing/huey').then((m) => m.Huey),
  hugo: () => import('@freesewing/hugo').then((m) => m.Hugo),
  jaeger: () => import('@freesewing/jaeger').then((m) => m.Jaeger),
  jane: () => import('@freesewing/jane').then((m) => m.Jane),
  jett: () => import('@freesewing/jett').then((m) => m.Jett),
  lily: () => import('@freesewing/lily').then((m) => m.Lily),
  lucy: () => import('@freesewing/lucy').then((m) => m.Lucy),
  lumina: () => import('@freesewing/lumina').then((m) => m.Lumina),
  lumira: () => import('@freesewing/lumira').then((m) => m.Lumira),
  lunetius: () => import('@freesewing/lunetius').then((m) => m.Lunetius),
  noble: () => import('@freesewing/noble').then((m) => m.Noble),
  octoplushy: () => import('@freesewing/octoplushy').then((m) => m.Octoplushy),
  onyx: () => import('@freesewing/onyx').then((m) => m.Onyx),
  opal: () => import('@freesewing/opal').then((m) => m.Opal),
  otis: () => import('@freesewing/otis').then((m) => m.Otis),
  paco: () => import('@freesewing/paco').then((m) => m.Paco),
  penelope: () => import('@freesewing/penelope').then((m) => m.Penelope),
  percy: () => import('@freesewing/percy').then((m) => m.Percy),
  polly: () => import('@freesewing/polly').then((m) => m.Polly),
  sabrina: () => import('@freesewing/sabrina').then((m) => m.Sabrina),
  sandy: () => import('@freesewing/sandy').then((m) => m.Sandy),
  sarah: () => import('@freesewing/sarah').then((m) => m.Sarah),
  sasha: () => import('@freesewing/sasha').then((m) => m.Sasha),
  shale: () => import('@freesewing/shale').then((m) => m.Shale),
  shelly: () => import('@freesewing/shelly').then((m) => m.Shelly),
  shin: () => import('@freesewing/shin').then((m) => m.Shin),
  simon: () => import('@freesewing/simon').then((m) => m.Simon),
  simone: () => import('@freesewing/simone').then((m) => m.Simone),
  skully: () => import('@freesewing/skully').then((m) => m.Skully),
  sophie: () => import('@freesewing/sophie').then((m) => m.Sophie),
  sunny: () => import('@freesewing/sunny').then((m) => m.Sunny),
  sven: () => import('@freesewing/sven').then((m) => m.Sven),
  tamiko: () => import('@freesewing/tamiko').then((m) => m.Tamiko),
  teagan: () => import('@freesewing/teagan').then((m) => m.Teagan),
  tiberius: () => import('@freesewing/tiberius').then((m) => m.Tiberius),
  tina: () => import('@freesewing/tina').then((m) => m.Tina),
  titan: () => import('@freesewing/titan').then((m) => m.Titan),
  toni: () => import('@freesewing/toni').then((m) => m.Toni),
  trayvon: () => import('@freesewing/trayvon').then((m) => m.Trayvon),
  tristan: () => import('@freesewing/tristan').then((m) => m.Tristan),
  uma: () => import('@freesewing/uma').then((m) => m.Uma),
  umbra: () => import('@freesewing/umbra').then((m) => m.Umbra),
  wahid: () => import('@freesewing/wahid').then((m) => m.Wahid),
  walburga: () => import('@freesewing/walburga').then((m) => m.Walburga),
  waralee: () => import('@freesewing/waralee').then((m) => m.Waralee),
  yuri: () => import('@freesewing/yuri').then((m) => m.Yuri),
};
export const designs = Object.keys(loaders);
export function load(id) {
  if (!loaders[id]) return Promise.reject(new Error(`Unknown FreeSewing design ${id}`));
  return loaders[id]();
}
