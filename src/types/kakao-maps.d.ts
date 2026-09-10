declare namespace kakao.maps {
  function load(callback: () => void): void

  class LatLng {
    constructor(latitude: number, longitude: number)
  }

  interface MapOptions {
    center: LatLng
    level?: number
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions)
    setCenter(latlng: LatLng): void
    setLevel(level: number): void
  }

  interface MarkerOptions {
    position: LatLng
    map?: Map
    title?: string
  }

  class Marker {
    constructor(options: MarkerOptions)
    setMap(map: Map | null): void
  }

  interface InfoWindowOptions {
    content?: string
  }

  class InfoWindow {
    constructor(options?: InfoWindowOptions)
    open(map: Map, marker: Marker): void
    close(): void
    setContent(content: string | HTMLElement): void
  }

  namespace event {
    function addListener(
      target: Marker,
      type: string,
      handler: () => void,
    ): void
  }

  interface MarkerClustererOptions {
    map: Map
    markers?: Marker[]
    gridSize?: number
    averageCenter?: boolean
    minLevel?: number
  }

  class MarkerClusterer {
    constructor(options: MarkerClustererOptions)
  }
}

interface Window {
  kakao: typeof kakao
}
