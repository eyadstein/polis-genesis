/** One place for sizes. One world unit is about 4 metres. */

export const METRES_PER_UNIT = 4;

/** An adult is about 1.8 metres tall. */
export const ADULT_HEIGHT = 0.45;
/** Height of the person model at scale 1, before shrinking to real size. */
const MODEL_HEIGHT = 1.1;
export const PERSON_SCALE = ADULT_HEIGHT / MODEL_HEIGHT;
export const CHILD_FACTOR = 0.7;

/** Height of one floor, by kind of home. */
export const FLOOR_HEIGHT = { Shack: 0.6, House: 0.75, Villa: 0.9, Flat: 0.75 } as const;
export const FLOORS = { Shack: 1, House: 1, Villa: 2, Flat: 4 } as const;

export const TREE_HEIGHT = 2;
export const LAMP_HEIGHT = 1.4;
