// Versions are date based and stored as semver YY.M.DNNN (see scripts/bump.js).
// This gives the readable form: '26.11.1001' -> '26.11.01.001'.
export const displayVersion = (version) => {
    const [yy, mm, p] = version.split('.').map(Number);
    const pad = (n, w) => String(n).padStart(w, '0');
    return `${pad(yy, 2)}.${pad(mm, 2)}.${pad(Math.floor(p / 1000), 2)}.${pad(p % 1000, 3)}`;
};
