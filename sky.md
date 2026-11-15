# Sky guide: a universe browser with nothing to install

This page is for two readers: **people starting out in astronomy** who want to fly round real stars, planets and galaxies in their browser, and **an AI** (through the MCP server) that builds space scenes for them. The viewer runs in any modern browser. There is nothing to install, and a scene is a single link or a single file.

- [Open the deep sky](./?scene=deepsky): 3239 stars, the Solar System at its true scale, 500 exoplanets, 1000 galaxies, 400 black holes, the Milky Way.
- [Open TRAPPIST-1](./?scene=sky:trappist-1): a small scene made from the sky catalogue in this guide.

## First flight

You are the pilot of a starship. The view is what you see from its window.

| key | what it does |
|---|---|
| Enter | **find**: type a name (*sirius*, *andromeda*, *proxima b*) or a kind (*white dwarf*, *black hole*, *spiral galaxy*, *rocky exoplanet*); the nearest come first |
| T / Tab | turn towards the object under the cross / the next object; the ship brakes by itself and stops at its surface |
| W S | speed forward / back (each press is one more level) |
| A D, R F | sideways, up and down |
| Space | stop |
| Esc | let the target go (you keep flying) |
| 0 | orbit round the target; 0 again leaves the ship circling on its own (gravity mode) |
| [ ] | roll |
| drag | look round |
| wheel | zoom the lens |
| ? | the full help |

The speed follows where you are. Far from everything a level is a quarter of a light year per second. Inside a star system it is 5 % of the distance to the nearest surface per second, so you can cross the galaxy and still land next to a moon. The readout at the top right shows the speed, and the distance to the target in light years, AU or km.

## How the universe is laid out

- **One unit is one light year.** The Sun sits at the origin. North on the sky (equatorial, the direction of Polaris) is up, the viewer's *y*. An equatorial *x, y, z* becomes *[x, z, −y]* in the scene.
- **Everything is at its real size.** The Sun's radius is 7.4 × 10⁻⁸ light years. From far away a star is only its glow, as in the real sky, and the planets fit round their stars at their true distances.
- **The precision is kept.** The scene is drawn relative to a moving origin, and the depth buffer is logarithmic. You can stand 10 km above a planet and still see a galaxy 30 billion light years away.

## How each kind of object is handled

Every object has a **name**, a **place**, a **size** and a **kind**. The kind decides how the viewer draws it and what the find box calls it.

### Stars

- **Drawn as** a sphere of the star's real radius plus a soft glow. The glow grows with the luminosity, so a bright star far away still shows.
- **The spectral class** (O B A F G K M, D for a white dwarf, L/T for a brown dwarf) sets the material. The **temperature** sets the tint, from red (2500 K) to blue-white (40 000 K).
- **The radius** comes from the luminosity and the temperature (L = R² T⁴) when you do not give it.
- **Find box:** *yellow G-type star*, *red M-type star*, *white dwarf star*, *brown dwarf*.
- **Flying:** the braking program stops you at 1.05 radii. You never fly through a star.

### Planets, moons, dwarf planets, exoplanets

- **Drawn by the planet shader:** each one is a ray-traced sphere, perfectly round at any distance. The parts it can show:
  - a procedural surface;
  - day and night, lit from the planet's own star;
  - an atmosphere;
  - rings, with the planet's shadow on them and their shadow on the planet.
- **Surface kinds:**
  - **rock**: cratered, two-tone, polar caps;
  - **earth**: oceans, continents, ice caps, drifting clouds, city lights at night;
  - **gas**: latitude bands, a great storm;
  - **ice**: soft bands, like Uranus and Neptune;
  - **cloud**: a Venus-like veil;
  - **lava**: a dark crust with glowing cracks.
- **When you give no surface,** the planet gets one of **30 recipes** by its size and its warmth (below). The variant comes from its name.
- **A planet goes round another object** (its star, or a moon round its planet). You give the size of the orbit; the plane and the phase can be given or are made up from the name.
- **Orbit lines** are drawn when asked for. They show with the sky group's *orbits* switch, which is off by default.
- **Find box:** *rocky planet*, *gas giant planet*, *moon*, *dwarf planet*, *temperate rocky exoplanet*, *hot gas giant exoplanet*, and so on.

| size | Earth radii | | warmth | equilibrium temperature |
|---|---|---|---|---|
| rocky | under 1.6 | | lava | over 1200 K |
| sub-Neptune | 1.6 – 4 | | hot | 700 – 1200 K |
| Neptune-like | 4 – 8 | | warm | 350 – 700 K |
| gas giant | over 8 | | temperate | 200 – 350 K |
| | | | cold | 100 – 200 K |
| | | | frozen | under 100 K |

The equilibrium temperature is computed from the star's luminosity and the distance (albedo 0.3) when you do not give it.

### Black holes

- **Drawn by a small ray tracer:**
  - the black shadow;
  - the photon ring;
  - a hot accretion disc, bent by gravity, brighter and bluer on the side coming towards you.
- **Drawn far bigger than they are.** A real event horizon is a few km for a stellar black hole, and ~10⁻⁶ ly for Sagittarius A*. Stellar black holes are drawn 0.3 ly across; supermassive ones grow with the square root of the mass (Sgr A*: 40 ly). You can set the drawn size yourself.
- **Find box:** *black hole*.

### Galaxies

- **A galaxy is a recipe, not a stored picture:** a kind, a seed and a few shape numbers. When it is big enough on screen, the viewer samples it into points (millions of stars each) in a background worker. The same recipe always gives the same galaxy.
- **The kinds:**
  - **spiral**: arms, optional bar;
  - **elliptical** or lenticular;
  - **irregular**: star-forming clumps;
  - **dwarf**;
  - **interacting**: a pair after an N-body run, with tidal tails;
  - **early**: a compact blue galaxy of the cosmic dawn.
- **Tilt:** the disc's inclination and position angle can be given.
- **Flying:** you can fly into a galaxy. The braking program only stops you at its edge when you come from very far, very fast.
- **Find box:** *spiral galaxy*, *elliptical galaxy*, *dwarf galaxy*, *interacting galaxies*.

### Also in the deep sky

These cannot be made from a sky catalogue yet:

- the **Milky Way**: 30 000 super-stars, a stored point cloud;
- the **constellation figures** as seen from Earth (the *figures* switch);
- your own **lines** between stars (V, the *lines* switch).

## Make your own scene: the sky catalogue

A sky catalogue is a JSON file in the format `3draft-sky`, written in the units astronomers use. The viewer turns it into a scene, with the same drawing, finding and flying as the deep sky. There are three ways to open one:

1. **f↑** in the viewer: choose the `.json` file.
2. **The + scene list**: the bundled catalogues (*TRAPPIST-1*), or a link `./?scene=sky:<name>`.
3. **An AI, through MCP**: the `view_sky` tool (below).

### An example

```json
{
  "format": "3draft-sky",
  "version": 1,
  "name": "TRAPPIST-1",
  "start": { "near": "TRAPPIST-1 e" },
  "objects": [
    { "type": "star", "name": "TRAPPIST-1", "ra": "23 06 29.37", "dec": "-05 02 29.0",
      "dist": 12.47, "unit": "pc", "spect": "M8V", "temp": 2566, "radius": 0.119, "lum": 0.000553,
      "info": "M8V red dwarf, 0.09 solar masses" },
    { "type": "planet", "name": "TRAPPIST-1 e", "around": "TRAPPIST-1", "a": 0.02925,
      "radius_earth": 0.92, "teq": 250, "incl": 20, "node": 40, "orbit": true,
      "info": "In the habitable zone" }
  ]
}
```

### The catalogue

| field | |
|---|---|
| `format` | `"3draft-sky"` |
| `version` | `1` |
| `name` | the scene's name |
| `info` | a line about the scene (not shown yet) |
| `start` | where the ship starts: `{ "near": "<name>", "distance": <ly> }` (by default far enough to see the object and everything round it), or `{ "eye": [x, y, z], "yaw": <deg>, "pitch": <deg> }` |
| `objects` | the list below |

### Every object

| field | |
|---|---|
| `type` | `star`, `planet`, `moon`, `dwarf planet`, `exoplanet`, `black hole`, `galaxy` |
| `name` | what the find box finds; also how `around` refers to it (case does not matter) |
| `info` | a sentence shown under the name while it is the target: what it is, where the numbers come from |
| `category` | overrides the kind the find box shows and searches |
| `color` | overrides the colour (`#rrggbb`) |

### Its place (one of these)

| fields | |
|---|---|
| `ra`, `dec` + `dist` + `unit` | right ascension and declination in **degrees**, or as strings `"hh mm ss.s"` / `"±dd mm ss"`; `ra_h` takes hours. The distance's unit: `ly` (default), `pc`, `kpc`, `Mpc`, `AU`, `kly`, `Mly`, `Gly` |
| `ra`, `dec` + `parallax` | parallax in milliarcseconds (Gaia's `parallax` column). Distance = 1000 / parallax parsec; a parallax of zero or below is left out |
| `xyz` + `unit` | equatorial Cartesian coordinates (Gaia, many catalogues) |
| `at` | scene coordinates in light years, `[x, y, z]` with y up |
| `around` + `a` / `a_km` | for planets and moons: the name of what it goes round and the orbit's radius (AU, or km for moons) |

### A star

| field | |
|---|---|
| `spect` | the spectral type: `G2V`, `M5.5Ve`, `K0III`, `DA2`, `T7` |
| `temp` | effective temperature, K (the class comes from it when there is no `spect`) |
| `lum` | luminosity in suns; or `absmag` (absolute V magnitude); or `vmag` (apparent V magnitude, with the distance) |
| `radius` | in solar radii (else from luminosity and temperature) |

### A planet, moon, dwarf planet or exoplanet

| field | |
|---|---|
| `around`, `a` or `a_km` | what it goes round, and the orbit's radius |
| `incl`, `node` | the orbit plane: tilt and turn in degrees (to the scene's horizontal plane). Give the same values to the planets of one system to keep them in one plane |
| `angle` | where it is on the orbit, degrees (else made up from the name) |
| `radius_earth` / `radius_km` / `radius_jup` | its size (a moon defaults to the Moon's) |
| `teq` | equilibrium temperature, K (else from the star) |
| `surface` | a shader recipe of your own (below) instead of the 30 classes |
| `ring` | `{ "inner": 1.3, "outer": 2.3, "color": "#cdbb98" }`: radii in planet radii |
| `orbit` | `true` draws the orbit (with the *orbits* switch); `orbitColor` sets its colour |

A **surface** recipe: `{ "kind": "gas", "colors": ["#b98d62", "#efe2c8", "#c0603a"], "detail": 14, "spot": true, "atmosphere": { "color": "#9fb8ff", "size": 0.02 } }`.

- `kind` is one of `rock`, `earth`, `gas`, `ice`, `cloud`, `lava`, with three `colors`.
- `detail` means:
  - `rock`: the polar caps;
  - `earth`: the sea level, 0–1;
  - `gas` and `ice`: how many bands.
- `spot` means:
  - `gas`: a great storm;
  - `earth`: city lights at night.

### A black hole

| field | |
|---|---|
| `mass` | in suns (sets the drawn size: over 10⁵ suns it is supermassive) |
| `radius_ly` | the drawn size of the shadow, light years |
| `incl`, `pa` | the disc's tilt, degrees |

### A galaxy

| field | |
|---|---|
| `kind` | `spiral`, `elliptical`, `lenticular`, `irregular`, `dwarf`, `interacting`, `early` |
| `diameter_kly` or `radius_ly` | its size (the Milky Way is ~90 kly across) |
| `incl`, `pa` | the disc's inclination and position angle, degrees |
| `arms`, `pitch`, `bar` | a spiral's arms (2–4), their pitch angle (degrees), a bar (0.2–0.5) |
| `clumps` | an irregular galaxy's star-forming clumps |

Anything the viewer cannot use is left out with a note: a missing place, an unknown type, a moon whose planet is not in the catalogue. The notes show in the scene line under the controls, and the MCP tool returns them.

## With an AI: the MCP server

The MCP server (`mcp/server.js`, Node 18+, no dependencies) lets an AI model, render and steer the open viewer. Set it up from the Spider Paint or 3Draft folder:

```
claude mcp add spider-paint -- node "$(pwd)/mcp/server.js"
codex mcp add spider-paint -- node "$(pwd)/mcp/server.js"
```

Then ask the AI for the `viewer` URL and open it. The tools for space:

| tool | |
|---|---|
| `view_sky` | makes a scene from a sky catalogue (as above) and shows it; `replace: false` adds it to what is there; `save` writes the made scene to a file |
| `view_example` | loads a bundled scene: `deepsky`, `stars`, `milkyway`, `sky:trappist-1` |
| `view_target` | aims at an object by name or kind (*"nearest white dwarf"*: `white dwarf`) |
| `view_camera` | puts the eye somewhere (light years) |
| `view_state` | what the person sees: eye, target, speed |

**For the AI.** When the person asks for a region, a cluster, a stellar population or a planetary system:

1. **Find real data** in a catalogue (below). Prefer measured values: parallax, spectral type, temperature, radius.
2. **Write the catalogue.** Put the source and the year in each object's `info` (*"Gaia DR3; teq from Agol 2021"*). Use one `incl` / `node` per planetary system.
3. **Keep the numbers as measured.** Do not round distances below the precision of the data, and do not invent what is unknown: leave it out and let the viewer choose.
4. **Show it** with `view_sky`. Read the returned notes and fix what was left out. Set `start` at the most interesting object.
5. **Take the person there** with `view_target`, and tell them what they are looking at.

Things to ask for:

- *"Make a scene of the Pleiades with its 50 brightest members from Gaia, and start inside the cluster."*
- *"Show the 20 nearest white dwarfs and fly me to the closest."*
- *"Build the Kepler-90 system with its eight planets, with orbits, and put me above it."*
- *"Put the Local Group's galaxies in, with their real sizes and tilts."*

## Where to find the numbers

| source | what it has |
|---|---|
| [Gaia Archive](https://gea.esac.esa.int/archive/) | positions, parallaxes, proper motions, temperatures and radii for ~1.8 billion stars (DR3); **DR4 is released on 2 December 2026**. ADQL queries, CSV / VOTable out. |
| [SIMBAD](https://simbad.cds.unistra.fr/simbad/) | one object at a time: names, spectral types, distances, references |
| [VizieR](https://vizier.cds.unistra.fr/) | thousands of published catalogues (clusters, white dwarfs, nebulae) |
| [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) | every confirmed exoplanet: orbit size, radius, temperature, host star |
| [Open Exoplanet Catalogue](https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue) | the same, as open files (the deep sky's exoplanets come from it) |
| [HYG database](https://www.astronexus.com/hyg) | 120 000 bright and near stars in one CSV (the deep sky's stars come from it) |

Useful conversions:

- distance in parsec = 1000 / parallax in mas;
- 1 pc = 3.26156 ly;
- 1 AU = 1.58125 × 10⁻⁵ ly;
- absolute magnitude M = m − 5 log₁₀(d / 10 pc).

## What is real and what is not

- **Real:**
  - positions, distances, sizes and colours, as precise as the catalogue;
  - the Solar System's planets where they stand on 14 November 2026;
  - the exoplanets' distances from their stars.
- **Made up when unknown:**
  - an orbit's plane and where the planet is on it (for most exoplanets these are not measured);
  - a galaxy's tilt without catalogue axes;
  - which side of a disc faces us;
  - planet surfaces: they are plausible by class, not observed.
- **Drawn bigger than real:** black holes. Galaxies are clouds of points, each point standing for millions of stars.
- **Limits:**
  - a scene of a few thousand objects flies smoothly;
  - tens of thousands of stars as points (from a Gaia query) are a planned next step;
  - proper motion (stars moving over time) is not shown yet.
