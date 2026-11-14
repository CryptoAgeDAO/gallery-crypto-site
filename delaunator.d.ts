declare module 'delaunator' {
  export default class Delaunator<T = ArrayLike<number>> {
    constructor(coords: ArrayLike<number>);
    static from(points: ArrayLike<ArrayLike<number>>): Delaunator;
    triangles: Uint32Array;
    halfedges: Int32Array;
    hull: Uint32Array;
    coords: T;
  }
}
