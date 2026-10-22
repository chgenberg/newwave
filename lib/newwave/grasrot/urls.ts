/** Var en förenings Gräsrot 360-filer serveras: tryckfilerna, produktbilderna, herobilden och inläggen. */
export const grasrotBase = (id: string) => `/api/v1/newwave/grasrot/${id}`;
export const mockupSrc = (id: string, product: string, color: string) => `${grasrotBase(id)}/mockup-${product}-${color}.jpg`;

/** Prefixet för Bilaga 2-produkterna bland butikens varor: `g360-tshirt`. */
export const SHOP_PREFIX = "g360-";
