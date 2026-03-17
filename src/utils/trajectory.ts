// 轨迹数据结构：Array<Array<[x, y]>>
export type Point = [number, number]
export type Track = Point[]
export type Tracks = Track[]

export function addDrag(tracks: Tracks): Tracks {
  const next = tracks ? tracks.slice() : []
  next.push([])
  return next
}

export function deleteLastDrag(tracks: Tracks): Tracks {
  if (!tracks || tracks.length === 0) return tracks || []
  const next = tracks.slice(0, tracks.length - 1)
  return next
}

export function deleteLastStep(tracks: Tracks): Tracks {
  if (!tracks || tracks.length === 0) return tracks || []
  const next = tracks.slice()
  const last = next[next.length - 1]
  if (last && last.length > 0) {
    next[next.length - 1] = last.slice(0, last.length - 1)
  }
  return next
}

export function resetTracks(): Tracks {
  return []
}

export function addPoint(tracks: Tracks, x: number, y: number): Tracks {
  const next = tracks ? tracks.slice() : []
  if (next.length === 0) next.push([])
  const last = next[next.length - 1].slice()
  last.push([Math.round(x), Math.round(y)])
  next[next.length - 1] = last
  return next
}
