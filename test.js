// Tests de la logique : node test.js
const assert = require("assert");
const TH = require("./logic.js");

const equipes = (tailles) => {
  const out = [];
  tailles.forEach((n, p) => { for (let i = 0; i < n; i++) out.push({ id: "e" + out.length, nom: "Equipe " + String.fromCharCode(65 + out.length), poule: "ABCDEFGH"[p], ordre: out.length }); });
  return out;
};
const arbitres = [
  { id: "r1", nom1: "Nom Prénom 1", nom2: "Nom Prénom 2", terrains: "1", ordre: 0 },
  { id: "r2", nom1: "Nom Prénom 3", nom2: "Nom Prénom 4", terrains: "2", ordre: 1 },
  { id: "r3", nom1: "Nom Prénom 5", nom2: null, terrains: null, ordre: 2 },
];

// 1. Calendrier complet et sans conflit, pour plusieurs configurations
for (const [tailles, terrains, terrainsPoule] of [
  [[4, 4], 2, { A: "1", B: "2" }], [[5], 3, {}], [[5, 5, 6], 4, { A: "1", B: "2", C: "3 et 4" }], [[16], 10, {}],
  [[2, 2, 2, 2, 2, 2, 2, 2], 2, {}], [[19, 3], 4, {}], [[3, 3, 3, 3, 4], 1, {}], [[7, 9], 5, { A: "1;2", B: "3-5" }], [[4, 4, 4], 3, { A: "1", B: "1", C: "9" }],
]) {
  const c = TH.calculer({ terrains, terrainsPoule, finales: [] }, equipes(tailles), [], []);
  assert.strictEqual(c.matchs.length, tailles.reduce((s, n) => s + (n * (n - 1)) / 2, 0), "nombre de matchs " + tailles);
  assert.strictEqual(new Set(c.matchs.map((m) => m.cle)).size, c.matchs.length, "match en double");
  const vus = new Set();
  for (const m of c.matchs) {
    for (const k of [m.heure + "|" + m.e1.id, m.e2 && m.heure + "|" + m.e2.id, m.heure + "|T" + m.terrain]) { if (k) { assert(!vus.has(k), "conflit " + k); vus.add(k); } }
    const permis = TH.listeTerrains(terrainsPoule[m.poule], terrains);
    assert(m.terrain >= 1 && m.terrain <= terrains && (!permis.length || permis.includes(m.terrain)), "terrain de poule");
    assert.deepStrictEqual(m.alertes, []);
  }
}

// 2. Scores, points, forfait, classement
const E = equipes([4, 4]);
let c = TH.calculer({}, E, arbitres, []);
assert.strictEqual(c.matchs[0].heure, "09:00");
assert.deepStrictEqual([c.finales[0].nom1, c.finales[0].nom2], ["Vainqueur Poule A", "2e Poule B"]);
assert.strictEqual(c.finales[7].nom2, "Vainqueur Demi-finale 2");
assert.strictEqual(c.finales[0].heure, "11:42"); // 6 créneaux de 27 min après 09:00
let graine = 1;
const alea = () => (graine = (graine * 16807) % 2147483647) % 21 + 10;
let saisies = c.matchs.map((m) => ({ cle: m.cle, score1: alea(), score2: alea() }));
saisies[5].forfait = 1;
c = TH.calculer({}, E, arbitres, saisies);
const pts = {};
for (const m of c.matchs) {
  const [a, b] = m.forfait === 1 ? [0, 3] : m.score1 > m.score2 ? [3, 1] : m.score1 === m.score2 ? [2, 2] : [1, 3];
  pts[m.e1.id] = (pts[m.e1.id] || 0) + a; pts[m.e2.id] = (pts[m.e2.id] || 0) + b;
}
for (const l of c.lettres) for (const x of c.classement[l].lignes) assert.strictEqual(x.pts, pts[x.equipe.id]);
assert(c.classement.A.complete && c.classement.B.complete);

// 3. Égalité : attente de départage, puis départage, puis phases finales et classement final
const egal = c.matchs.map((m) => ({ cle: m.cle, score1: 10, score2: 10 }));
c = TH.calculer({}, E, arbitres, egal);
assert.strictEqual(c.classement.A.lignes[0].remarque, "⚠ égalité à départager");
assert.strictEqual(c.finales[0].nom1, "⚠ départager poule A");
E.forEach((e, i) => (e.departage = (i % 4) + 1));
const fin = [[20, 18], [15, 22], [19, 19], [25, 24], [30, 10], [17, 12], [21, 26], [28, 27]];
const tout = [...egal, ...c.finales.map((f, i) => ({ cle: f.cle, score1: fin[i][0], score2: fin[i][1] }))];
c = TH.calculer({}, E, arbitres, tout);
assert.deepStrictEqual(c.finales.slice(0, 2).map((f) => [f.nom1, f.nom2]), [["Equipe A", "Equipe F"], ["Equipe E", "Equipe B"]]);
assert.deepStrictEqual(c.places.slice(0, 4).map((p) => p.nom), ["Equipe A", "Equipe B", "Equipe E", "Equipe F"]);
assert(c.finales[2].alertes[0].startsWith("Match nul"));
assert(c.finales[4].alertes[0].startsWith("Équipes pas encore connues"));
assert.strictEqual(c.places[4].nom, "Vainqueur Match pour la 5e place");
E.forEach((e) => delete e.departage);

// 4. Alertes arbitres, terrain, équipe ; horaire manuel ; pause repas ; planning coupé
c = TH.calculer({}, E, arbitres, []);
const m1 = c.matchs[0], m2 = c.matchs.find((m) => m.poule === "B"), m3 = c.matchs[1]; // m1 : poule A terrain 1 à 09:00 ; m2 : poule B terrain 2 à 09:00 ; m3 : poule A à 09:27
assert.deepStrictEqual([m1.terrain, m2.terrain, m2.heure, m3.heure], [1, 2, "09:00", "09:27"]);
const alertes = (m) => c.matchs.find((x) => x.cle === m.cle).alertes;
c = TH.calculer({}, E, arbitres, [{ cle: m1.cle, arbitre_id: "r1" }, { cle: m2.cle, arbitre_id: "r1", renfort_id: "r1" }, { cle: m3.cle, arbitre_id: "r3", renfort_id: "r2" }]);
assert.deepStrictEqual(alertes(m1), ["Arbitre déjà occupé à cette heure."]);
assert.deepStrictEqual(alertes(m2), ["Arbitre non prévu sur ce terrain.", "Arbitre déjà occupé à cette heure.", "Renfort = arbitrage."]);
assert.deepStrictEqual(alertes(m3), []);
assert.deepStrictEqual(c.arbitres.map((a) => [a.designation, a.nb]), [["Nom Prénom 1 / Nom Prénom 2", 3], ["Nom Prénom 3 / Nom Prénom 4", 1], ["Nom Prénom 5", 1]]);
const autre = c.matchs.find((m) => m.cle !== m1.cle && (m.e1 === m1.e1 || m.e2 === m1.e1));
c = TH.calculer({ pauseApres: 2, pauseDuree: 60 }, E, arbitres, [{ cle: m1.cle, heure: "14h30", terrain: 2 }, { cle: autre.cle, heure: "14:35", terrain: 2 }]);
assert.strictEqual(c.matchs[0].heure, "14:30");
assert(c.matchs[0].alertes.includes("Terrain déjà occupé.") && c.matchs[0].alertes.some((a) => a.endsWith("déjà en match.")));
assert.strictEqual(c.matchs.find((m) => m.creneau === 3 && !m.heureSaisie).heure, "10:54"); // 09:00 + 2 × 27 + 60
c = TH.calculer({ auto: false }, E, arbitres, []);
assert(c.matchs.every((m) => m.heure === "" && m.terrain === null));
assert.deepStrictEqual(["14:30", "14h30", "9.05", "14", "25:00", "abc"].map(TH.minutes), [870, 870, 545, 840, null, null]);

// 5. Poule de 3 : le perdant du 1er match rejoue contre l'équipe au repos ; choix de l'équipe au repos
const T = equipes([3]);
c = TH.calculer({ finales: [] }, T, [], []);
assert.deepStrictEqual(c.matchs.map((m) => [m.nom1, m.nom2, m.heure]), [["Equipe A", "Equipe B", "09:00"], ["Equipe C", "Perdant du 1er match", "09:27"], ["Equipe C", "Vainqueur du 1er match", "09:54"]]);
assert(!c.matchs[1].joue && !c.classement.A.complete);
const s3 = [{ cle: c.matchs[0].cle, score1: 12, score2: 9 }, { cle: c.matchs[1].cle, score1: 10, score2: 10 }, { cle: c.matchs[2].cle, score1: 5, score2: 8 }];
c = TH.calculer({ finales: [] }, T, [], s3);
assert.deepStrictEqual(c.matchs.map((m) => m.nom2), ["Equipe B", "Equipe B", "Equipe A"]);
assert.deepStrictEqual(c.classement.A.lignes.map((x) => [x.equipe.nom, x.pts, x.j]), [["Equipe A", 6, 2], ["Equipe B", 3, 2], ["Equipe C", 3, 2]]);
assert(c.classement.A.complete);
c = TH.calculer({ finales: [] }, T, [], [{ cle: c.matchs[0].cle, score1: 7, score2: 7 }]); // nul : l'équipe citée en premier rejoue
assert.deepStrictEqual(c.matchs.map((m) => m.nom2), ["Equipe B", "Equipe A", "Equipe B"]);
c = TH.calculer({ finales: [], repos3: { A: "e0" } }, T, [], []);
assert.deepStrictEqual(c.matchs.map((m) => [m.nom1, m.nom2]), [["Equipe B", "Equipe C"], ["Equipe A", "Perdant du 1er match"], ["Equipe A", "Vainqueur du 1er match"]]);

// 6. Classement final : une place par équipe engagée
assert.strictEqual(TH.calculer({}, equipes([5, 5]), [], []).places.length, 10);
c = TH.calculer({}, equipes([3, 3]), [], []);
assert.deepStrictEqual([c.places.length, c.places[0].nom], [6, "Vainqueur Finale"]);
assert.strictEqual(TH.calculer({ places: [] }, equipes([2]), [], []).places[1].nom, "à définir");

// 7. Phases finales : l'ordre de passage décide de l'heure, pas la position dans la liste
const F = [{ code: "A1", intitule: "Demi 1", tour: 1, e1: "1A", e2: "2B", terrain: 1 }, { code: "A2", intitule: "Finale", tour: 2, e1: "V-A1", e2: "V-A3", terrain: 1 },
  { code: "A3", intitule: "Demi 2", tour: 1, e1: "1B", e2: "2A", terrain: 2 }];
c = TH.calculer({ finales: F }, E, [], []);
assert.deepStrictEqual(c.finales.map((f) => [f.intitule, f.heure, f.terrain]), [["Demi 1", "11:42", 1], ["Demi 2", "11:42", 2], ["Finale", "12:09", 1]]);
assert.strictEqual(c.finales[2].nom2, "Vainqueur Demi 2");

console.log("Tous les tests passent.");
