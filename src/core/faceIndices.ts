// MediaPipe Face Mesh (478-point) indices, checked against the canonical face model UV map
// (mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png).
// "L"/"R" below are the subject's image-left / image-right halves as MediaPipe numbers them.
export const FACE_INDICES_VERSION = 1;

export const FI = {
  foreheadTop: 10,
  chin: 152,
  faceEdgeL: 234,
  faceEdgeR: 454,
  noseBridge: 168,
  noseTip: 1,
  upperLipInner: 13,
  browL: [70, 63, 105, 66, 107],
  browR: [336, 296, 334, 293, 300],
  eyeL: { upperLid: 159, outer: 33, inner: 133 },
  eyeR: { upperLid: 386, outer: 263, inner: 362 },
} as const;

/** Every face index the core reads. The recorder stores only these (keeps recordings small). */
export const USED_FACE_INDICES: number[] = Array.from(
  new Set<number>([
    FI.foreheadTop, FI.chin, FI.faceEdgeL, FI.faceEdgeR, FI.noseBridge, FI.noseTip, FI.upperLipInner,
    ...FI.browL, ...FI.browR,
    FI.eyeL.upperLid, FI.eyeL.outer, FI.eyeL.inner, FI.eyeR.upperLid, FI.eyeR.outer, FI.eyeR.inner,
  ]),
).sort((a, b) => a - b);

/** Hand landmark indices (21-point model). */
export const HI = {
  wrist: 0, thumbTip: 4, indexTip: 8, middleTip: 12, ringTip: 16, pinkyTip: 20,
  indexMcp: 5, middleMcp: 9, pinkyMcp: 17,
} as const;
export const TIP_INDICES = [HI.thumbTip, HI.indexTip, HI.middleTip] as const;
