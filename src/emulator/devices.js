// Device profiles. The numbers are approximate (a field of view in degrees per eye, pixels per eye, the eye distance in metres, Hz):
// enough for the emulator to behave like a headset, not a measurement of one.
export const devices = {
  metaQuest3: {
    name: 'Meta Quest 3',
    ipd: 0.063,
    fov: { left: 52, right: 44, up: 48, down: 48 }, // per eye; the right eye mirrors it
    resolution: { width: 2064, height: 2208 },
    refreshRate: 90,
    supportedFrameRates: [72, 80, 90, 120],
    profiles: ['meta-quest-touch-plus', 'oculus-touch-v3', 'generic-trigger-squeeze-thumbstick'],
  },
  metaQuest2: {
    name: 'Meta Quest 2',
    ipd: 0.063,
    fov: { left: 48, right: 46, up: 48, down: 46 },
    resolution: { width: 1832, height: 1920 },
    refreshRate: 90,
    supportedFrameRates: [72, 90, 120],
    profiles: ['oculus-touch-v3', 'generic-trigger-squeeze-thumbstick'],
  },
};
