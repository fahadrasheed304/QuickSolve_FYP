'use client'

type FaceApi = typeof import('@vladmandic/face-api')
type FaceRuntime = FaceApi['tf'] & { setBackend: (backend: string) => Promise<boolean>; ready: () => Promise<void> }
type WeightSpecs = Parameters<FaceApi['tf']['io']['decodeWeights']>[1]
type ManifestGroup = { paths: string[]; weights: WeightSpecs }

export function expectedWeightBytes(weights: WeightSpecs) {
  return weights.reduce((total, weight) => {
    const elements = weight.shape.reduce((size, dimension) => size * dimension, 1)
    const dtype = weight.quantization?.dtype || weight.dtype
    const bytes = dtype === 'uint8' || dtype === 'bool' ? 1 : dtype === 'uint16' || dtype === 'float16' ? 2 : dtype === 'float32' || dtype === 'int32' ? 4 : 0
    if (!bytes || !Number.isSafeInteger(elements) || elements <= 0) throw new Error('Unsupported face model weights')
    return total + elements * bytes
  }, 0)
}

// Read the actual shard bytes instead of relying on the bundled IO loader.
// Validate before constructing tensors, so empty/truncated responses cannot be used.
export async function fetchFaceWeights(name: string, fetcher: typeof fetch = fetch) {
  const base = '/models/'
  const version = '?v=face-api-1.7.15'
  const response = await fetcher(`${base}${name}-weights_manifest.json${version}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Face verification model could not be downloaded. Please retry.')
  const manifest = await response.json() as ManifestGroup[]
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('Invalid face model manifest')
  const groups = []
  for (const group of manifest) {
    if (!Array.isArray(group.paths) || !group.paths.length || !Array.isArray(group.weights) || !group.weights.length) throw new Error('Invalid face model manifest')
    const chunks = []
    for (const path of group.paths) {
      if (!/^[a-z0-9_-]+\.bin$/i.test(path)) throw new Error('Invalid face model shard')
      const shard = await fetcher(base + path + version, { cache: 'no-store' })
      if (!shard.ok) throw new Error('Face verification model could not be downloaded. Please retry.')
      chunks.push(new Uint8Array(await shard.arrayBuffer()))
    }
    const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    if (length !== expectedWeightBytes(group.weights)) throw new Error('Face verification model download is incomplete. Please reload and retry.')
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    groups.push({ weights: group.weights, buffer: bytes.buffer })
  }
  return groups
}

let runtimePromise: Promise<FaceApi> | null = null
const models = new Map<string, Promise<void>>()
async function faceRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('@vladmandic/face-api').then(async api => {
      // One backend for both photo validation and test identity/proctoring checks.
      const tf = api.tf as FaceRuntime
      if (!await tf.setBackend('cpu')) throw new Error('Face verification runtime could not start')
      await tf.ready()
      return api
    }).catch(error => { runtimePromise = null; throw error })
  }
  return runtimePromise
}

export async function loadFaceModels(recognition = false) {
  const api = await faceRuntime()
  const required = recognition
    ? ['tinyFaceDetector', 'faceLandmark68Net', 'faceRecognitionNet'] as const
    : ['tinyFaceDetector'] as const
  const files = { tinyFaceDetector: 'tiny_face_detector_model', faceLandmark68Net: 'face_landmark_68_model', faceRecognitionNet: 'face_recognition_model' }
  for (const name of required) {
    let loading = models.get(name)
    if (!loading) {
      loading = (async () => {
        const groups = await fetchFaceWeights(files[name])
        const weights: Parameters<FaceApi['nets']['tinyFaceDetector']['loadFromWeightMap']>[0] = {}
        try {
          for (const group of groups) Object.assign(weights, api.tf.io.decodeWeights(group.buffer, group.weights))
          api.nets[name].loadFromWeightMap(weights)
        } catch (error) {
          for (const tensor of Object.values(weights)) tensor.dispose()
          throw error
        }
      })().catch(error => { models.delete(name); throw error })
      models.set(name, loading)
    }
    await loading
  }
  return api
}
