/** Fotografier av klubbarnas produkter i bruk. I merch-listan öppnar varje bild sin produkt och de breda står över hela rutnätet; Craft använder dem som bild i klubbens material. */
export type MerchScene = {
  id: string;
  itemId: string;
  src: string;
  caption: string;
  /** Hela bredden; `focus` är var bilden beskärs i höjdled. */
  wide?: { focus: string };
};

const scene = (id: string, itemId: string, caption: string, wide?: MerchScene["wide"]): MerchScene => ({ id, itemId, src: `/newwave/merch/scenes/${id}.jpg`, caption, wide });

export const MERCH_SCENES: MerchScene[] = [
  scene("goteborg-hoodie", "ifk-goteborg-marke-p004", "Kvällsmatch på läktaren"),
  scene("fjaras-filt", "fjaras-bk-marke-p035", "Söndag i soffan"),
  scene("lerum-sweat", "lerums-is-marke-p005", "Fika i solen"),
  scene("kungsbacka-mossa", "kungsbacka-if-marke-p012", "Vinterträning"),
  scene("onsala-mugg", "onsala-bk-marke-p022", "Morgonkaffe"),
  scene("partille-tee", "partille-if-marke-p008", "Träning i hallen"),
  scene("tolo-keps", "tolo-if-marke-p011", "Lördag vid sidlinjen"),
  scene("alingsas-filt", "alingsas-hk-marke-p035", "Picknick på cupen"),
  scene("varberg-kasse", "varbergs-gif-marke-p014", "Promenad vid fästningen"),
  scene("molndal-hoodie", "molndals-ibk-marke-p004", "Efter träningen"),
  scene("torslanda-bag", "torslanda-hk-marke-p016", "Packad och klar"),
  scene("stenungsund-flaska", "stenungsunds-if-marke-p020", "I omklädningsrummet"),
  scene("asa-hoodie", "asa-if-klubbandan-p004", "Kväll på klipporna i Åsa", { focus: "50% 62%" }),
  scene("kungsbacka-termos", "kungsbacka-if-marke-p021", "Kvällsmatch i november", { focus: "50% 10%" }),
  scene("asa-cup", "asa-if-cupen-p001", "Mål på Åsa Cupen", { focus: "50% 35%" }),
];

/** Klubbens foton; tomt för klubbar som saknar egna. */
export const clubScenes = (clubId: string) => MERCH_SCENES.filter((s) => s.itemId.startsWith(`${clubId}-`));
