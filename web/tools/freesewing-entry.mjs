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
// To add a design: npm install --save-dev --save-exact @freesewing/<design>, export its
// class here, and add an adapter in src/fs/ (see src/fs/bruce.js).
export { Bruce } from '@freesewing/bruce';
export { Hugo } from '@freesewing/hugo';
export { Teagan } from '@freesewing/teagan';
export { Sven } from '@freesewing/sven';
export { Aaron } from '@freesewing/aaron';
export { version } from '@freesewing/core';
