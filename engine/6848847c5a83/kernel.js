// The HEXAW kernel: ray picking in WebAssembly written in HEXAW (kernel/pick.hexaw).
// The mesh is copied into the kernel's linear memory once, as long as it is the same object,
// then every pick is one call that walks all triangles. Same answers as pick() in pick.ts.
import { dot, norm, plus, times } from './vec.js';
import { faceNormal } from './mesh.js';
import { triangulate } from './triangulate.js';
import { ray } from './camera.js';
import { KERNEL_BYTES } from './kernel-bytes.js';
const POS = 64; // vertices start here, 24 bytes each (f64 x y z)
const decode = (b64) => {
    if (typeof Buffer !== 'undefined')
        return new Uint8Array(Buffer.from(b64, 'base64'));
    const s = atob(b64);
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
export const initKernel = async () => {
    if (typeof WebAssembly === 'undefined')
        throw new Error('WebAssembly is not available');
    const { instance } = (await WebAssembly.instantiate(decode(KERNEL_BYTES)));
    const { pick: kPick, memory } = instance.exports;
    let uploaded = null; // the mesh now in the kernel's memory
    let triBase = 0;
    let triCount = 0;
    const upload = (mesh) => {
        const nv = mesh.positions.length;
        let nt = 0;
        for (const f of mesh.faces)
            nt += Math.max(0, f.v.length - 2);
        triBase = (POS + nv * 24 + 7) & ~7;
        const need = Math.ceil((triBase + nt * 16 + 8) / 65536);
        const have = memory.buffer.byteLength / 65536;
        if (need > have)
            memory.grow(need - have);
        // grow() detaches the old buffer, so the views are made after it
        const f64 = new Float64Array(memory.buffer, POS, nv * 3);
        for (let i = 0; i < nv; i++) {
            const p = mesh.positions[i];
            f64[i * 3] = p[0];
            f64[i * 3 + 1] = p[1];
            f64[i * 3 + 2] = p[2];
        }
        // faces are cut into triangles (a fan, or ear clipping for a concave one), each remembering its face number
        const i32 = new Int32Array(memory.buffer, triBase, nt * 4);
        let at = 0;
        mesh.faces.forEach((f, face) => {
            for (const [a, b, c] of triangulate(f.v.map((k) => mesh.positions[k]))) {
                i32[at] = f.v[a];
                i32[at + 1] = f.v[b];
                i32[at + 2] = f.v[c];
                i32[at + 3] = face;
                at += 4;
            }
        });
        triCount = nt;
        uploaded = mesh;
    };
    /**
     * The nearest surface under panel pixel (x, y), or null: the same result as pick() in pick.js,
     * { face, distance, point, normal, front, color }.
     */
    const pick = (mesh, cam, x, y, { cull = true } = {}) => {
        if (mesh !== uploaded)
            upload(mesh);
        const { origin: o, dir: d } = ray(cam, x, y);
        const face = kPick(o[0], o[1], o[2], d[0], d[1], d[2], POS, triBase, triCount, cull ? 1 : 0);
        if (face < 0)
            return null;
        const distance = new Float64Array(memory.buffer, 0, 1)[0];
        const f = mesh.faces[face];
        const outward = norm(faceNormal(f.v.map((k) => mesh.positions[k])));
        const front = dot(outward, d) < 0;
        return {
            face,
            distance,
            point: plus(o)(times(distance)(d)),
            normal: front ? outward : times(-1)(outward),
            front,
            color: f.color,
        };
    };
    return { pick, get loaded() { return uploaded; }, instance };
};
