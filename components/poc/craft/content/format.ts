/** Kronor med lagom många decimaler: "0,03 kr", "4 kr", "1,5 kr". Delas av server- och klientkomponenterna. */
export const sek = (n: number) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: n < 1 ? 2 : n < 10 ? 1 : 0 }).format(n)} kr`;
