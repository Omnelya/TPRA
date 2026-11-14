// Logique du tournoi (sans accès réseau) : matchs de poule, planning, classement, phases finales, alertes.
// Utilisée par app.js dans le navigateur et par test.js avec Node.
const TH = (() => {
  const LETTRES = "ABCDEFGH";
  const NTM = 10; // nombre maximum de terrains

  const DEFAUT = {
    points: { v: 3, n: 2, d: 1, f: 0 },
    auto: true, debutH: 9, debutM: 0,
    periodes: 2, dureePeriode: 10, pausePeriode: 2, pauseMatch: 5,
    terrains: 2, pauseApres: 0, pauseDuree: 60,
    terrainsPoule: { A: "1", B: "2" },
    finales: [
      { code: "DF1", intitule: "Demi-finale 1", tour: 1, e1: "1A", e2: "2B", terrain: 1 },
      { code: "DF2", intitule: "Demi-finale 2", tour: 1, e1: "1B", e2: "2A", terrain: 2 },
      { code: "CL1", intitule: "Classement 5-8 (1)", tour: 1, e1: "3A", e2: "4B", terrain: 1 },
      { code: "CL2", intitule: "Classement 5-8 (2)", tour: 1, e1: "3B", e2: "4A", terrain: 2 },
      { code: "M7", intitule: "Match pour la 7e place", tour: 2, e1: "P-CL1", e2: "P-CL2", terrain: 2 },
      { code: "M5", intitule: "Match pour la 5e place", tour: 2, e1: "V-CL1", e2: "V-CL2", terrain: 1 },
      { code: "P3", intitule: "Match pour la 3e place", tour: 2, e1: "P-DF1", e2: "P-DF2", terrain: 2 },
      { code: "F", intitule: "Finale", tour: 2, e1: "V-DF1", e2: "V-DF2", terrain: 1 },
    ],
    places: ["V-F", "P-F", "V-P3", "P-P3", "V-M5", "P-M5", "V-M7", "P-M7"],
  };

  const txt = (s) => (s ?? "").toString().trim();
  const nb = (x, defaut) => (Number.isFinite(+x) && x !== "" && x !== null ? +x : defaut);
  const reglages = (r = {}) => ({ ...DEFAUT, ...r, points: { ...DEFAUT.points, ...(r.points || {}) } });

  // "1 et 2 ; 3" → [1, 2, 3], limité aux terrains existants
  function listeTerrains(s, nTer) {
    const n = txt(s).split(/[^0-9]+/).filter(Boolean).map(Number);
    return [...new Set(n)].filter((t) => t >= 1 && t <= nTer);
  }

  // "14:30", "14h30", "9.05", "14" → minutes depuis minuit ; null si illisible
  function minutes(s) {
    const m = txt(s).toLowerCase().match(/^(\d{1,2})(?:\s*[h:.]\s*(\d{1,2})?)?$/);
    if (!m) return null;
    const h = +m[1], mi = +(m[2] || 0);
    return h < 24 && mi < 60 ? h * 60 + mi : null;
  }
  const hhmm = (m) => (m == null ? "" : String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
  const clePoule = (a, b) => "P:" + [a, b].sort().join(":");
  const rangPoule = (rang, lettre) => (rang === 1 ? "Vainqueur" : rang + "e") + " Poule " + lettre;
  const designation = (a) => (a ? txt(a.nom1) + (txt(a.nom2) ? " / " + txt(a.nom2) : "") : "");

  function calculer(reglagesBruts, equipes, arbitres, saisies) {
    const r = reglages(reglagesBruts);
    const nTer = Math.max(1, Math.min(NTM, nb(r.terrains, 1)));
    const dMatch = nb(r.periodes, 2) * nb(r.dureePeriode, 10) + (nb(r.periodes, 2) - 1) * nb(r.pausePeriode, 0);
    const dCreneau = Math.max(1, dMatch + nb(r.pauseMatch, 0));
    const debut = nb(r.debutH, 9) * 60 + nb(r.debutM, 0);
    const S = new Map(saisies.map((s) => [s.cle, s]));
    const A = new Map(arbitres.map((a) => [a.id, a]));
    const tous = [...Array(nTer)].map((_, i) => i + 1);

    // --- poules
    const actives = [...equipes].sort((a, b) => a.ordre - b.ordre).filter((e) => txt(e.nom) && LETTRES.includes(e.poule || "?"));
    const poules = {};
    for (const e of actives) (poules[e.poule] ||= []).push(e);
    const lettres = [...LETTRES].filter((l) => poules[l]);

    // --- planning : chaque match prend le créneau le plus tôt sur un terrain permis
    const dernierTerrain = Array(nTer + 1).fill(0);
    const dernierEquipe = new Map();
    let dernierCreneau = 0;
    function placer(m, permis, mini) {
      let c = Infinity, t = 0;
      for (const p of permis.length ? permis : tous) {
        const x = Math.max(dernierTerrain[p] + 1, mini);
        if (x < c) { c = x; t = p; }
      }
      dernierTerrain[t] = c;
      dernierCreneau = Math.max(dernierCreneau, c);
      m.creneau = c;
      m.terrainAuto = t;
    }

    // --- saisies, horaire et résultat d'un match
    function terminer(m) {
      const s = S.get(m.cle) || {};
      const auto = r.auto ? debut + (m.creneau - 1) * dCreneau + (nb(r.pauseApres, 0) > 0 && m.creneau > r.pauseApres ? nb(r.pauseDuree, 0) : 0) : null;
      m.heureSaisie = txt(s.heure);
      m.terrainSaisi = s.terrain ?? null;
      m.min = minutes(s.heure) ?? auto;
      m.heure = hhmm(m.min);
      m.terrain = s.terrain ?? (r.auto ? m.terrainAuto : null);
      m.score1 = s.score1 ?? null;
      m.score2 = s.score2 ?? null;
      m.forfait = s.forfait ?? null;
      m.arbitre = A.get(s.arbitre_id) || null;
      m.renfort = A.get(s.renfort_id) || null;
      m.joue = !!(m.e1 && m.e2 && (m.forfait || (m.score1 != null && m.score2 != null)));
      m.res1 = m.res2 = null;
      if (m.joue) {
        if (m.forfait === 1) [m.res1, m.res2] = ["F", "V"];
        else if (m.forfait === 2) [m.res1, m.res2] = ["V", "F"];
        else if (m.score1 > m.score2) [m.res1, m.res2] = ["V", "D"];
        else if (m.score1 < m.score2) [m.res1, m.res2] = ["D", "V"];
        else [m.res1, m.res2] = ["N", "N"];
      }
      m.vainqueur = m.res1 === "V" ? m.e1 : m.res2 === "V" ? m.e2 : null;
      m.perdant = m.res1 === "V" ? m.e2 : m.res2 === "V" ? m.e1 : null;
      m.alertes = [];
    }

    // --- matchs de poule : tous contre tous (méthode du tourniquet), journée par journée
    const matchs = [];
    const nbTours = Math.max(0, ...lettres.map((l) => poules[l].length + (poules[l].length % 2) - 1));
    for (let tour = 0; tour < nbTours; tour++) {
      for (const l of lettres) {
        const p = poules[l], n = p.length, pair = n + (n % 2);
        for (let k = 0; k < pair / 2; k++) {
          if (n < 2 || tour > pair - 2 || (n % 2 === 1 && k === 0)) continue;
          const i1 = k === 0 ? pair - 1 : (tour + k) % (pair - 1);
          const i2 = k === 0 ? tour : (tour - k + pair - 1) % (pair - 1);
          const m = { phase: "poule", num: matchs.length + 1, poule: l, tour: tour + 1, e1: p[i1], e2: p[i2] };
          m.nom1 = m.e1.nom; m.nom2 = m.e2.nom;
          m.cle = clePoule(m.e1.id, m.e2.id);
          const mini = Math.max(dernierEquipe.get(m.e1.id) || 0, dernierEquipe.get(m.e2.id) || 0) + 1;
          placer(m, listeTerrains(r.terrainsPoule?.[l], nTer), mini);
          dernierEquipe.set(m.e1.id, m.creneau);
          dernierEquipe.set(m.e2.id, m.creneau);
          terminer(m);
          matchs.push(m);
        }
      }
    }

    // --- classement des poules (aux points ; l'égalité se règle avec « departage »)
    const bareme = { V: nb(r.points.v, 3), N: nb(r.points.n, 2), D: nb(r.points.d, 1), F: nb(r.points.f, 0) };
    const classement = {};
    for (const l of lettres) {
      const lignes = poules[l].map((e) => ({ equipe: e, pts: 0, j: 0, g: 0, n: 0, p: 0, f: 0, bp: 0, bc: 0 }));
      const de = new Map(lignes.map((x) => [x.equipe.id, x]));
      const ms = matchs.filter((m) => m.poule === l);
      for (const m of ms.filter((m) => m.joue)) {
        for (const [x, res, pour, contre] of [[de.get(m.e1.id), m.res1, m.score1, m.score2], [de.get(m.e2.id), m.res2, m.score2, m.score1]]) {
          x.j++; x.pts += bareme[res];
          x[{ V: "g", N: "n", D: "p", F: "f" }[res]]++;
          x.bp += pour || 0; x.bc += contre || 0;
        }
      }
      for (const x of lignes) {
        const dep = x.equipe.departage ?? 99;
        x.diff = x.bp - x.bc;
        x.rang = 1 + lignes.filter((y) => y.pts > x.pts || (y.pts === x.pts && (y.equipe.departage ?? 99) < dep)).length;
        x.exAequo = lignes.some((y) => y !== x && y.pts === x.pts);
      }
      const complete = ms.length > 0 && ms.every((m) => m.joue);
      for (const x of lignes) {
        x.doublon = lignes.some((y) => y !== x && y.rang === x.rang);
        x.remarque = x.doublon ? (complete ? "⚠ égalité à départager" : "ex aequo") : "";
      }
      lignes.sort((a, b) => a.rang - b.rang || a.equipe.ordre - b.equipe.ordre);
      classement[l] = { lignes, complete };
    }

    // --- code (1A, V-DF1, P-DF1, nom d'équipe) → équipe, ou texte d'attente
    function resoudre(code, avant) {
      const c = txt(code).toUpperCase();
      const inconnu = { eq: null, nom: "⚠ à définir" };
      if (!c) return { eq: null, nom: "" };
      let m = c.match(/^([VP])-(.+)$/);
      if (m) {
        const f = avant.find((x) => x.code === m[2]);
        if (!f) return inconnu;
        const e = m[1] === "V" ? f.vainqueur : f.perdant;
        return e ? { eq: e, nom: e.nom } : { eq: null, nom: (m[1] === "V" ? "Vainqueur " : "Perdant ") + (f.intitule || "match") };
      }
      const parNom = actives.find((e) => txt(e.nom).toUpperCase() === c);
      if (parNom) return { eq: parNom, nom: parNom.nom };
      m = c.match(/^(\d+)([A-H])$/);
      if (!m || !classement[m[2]]) return inconnu;
      const cl = classement[m[2]], rang = +m[1];
      if (!cl.complete) return { eq: null, nom: rangPoule(rang, m[2]) };
      const x = cl.lignes.filter((y) => y.rang === rang);
      if (x.length === 1) return { eq: x[0].equipe, nom: x[0].equipe.nom };
      return cl.lignes.some((y) => y.doublon) ? { eq: null, nom: "⚠ départager poule " + m[2] } : inconnu;
    }

    // --- phases finales, dans l'ordre de la liste ; un nouveau tour commence après tous les matchs déjà placés
    const finales = [];
    let base = 0, tourAvant = null;
    for (const d of r.finales || []) {
      const code = txt(d.code).toUpperCase();
      if (!code) continue;
      const m = { phase: "finale", code, intitule: txt(d.intitule), tour: nb(d.tour, 1), cle: "F:" + code };
      const a = resoudre(d.e1, finales), b = resoudre(d.e2, finales);
      m.e1 = a.eq; m.nom1 = a.nom; m.e2 = b.eq; m.nom2 = b.nom;
      if (tourAvant === null || m.tour !== tourAvant) base = dernierCreneau + 1;
      tourAvant = m.tour;
      const t = nb(d.terrain, 0);
      placer(m, t >= 1 && t <= nTer ? [t] : [], base);
      terminer(m);
      if (finales.some((x) => x.code === code)) m.alertes.push("Code de match en double.");
      finales.push(m);
    }

    // --- alertes
    const tousMatchs = [...matchs, ...finales];
    const enMemeTemps = (a) => tousMatchs.filter((b) => b !== a && a.min != null && b.min != null && Math.abs(a.min - b.min) < dMatch);
    const compte = new Map();
    for (const m of tousMatchs) {
      for (const x of [m.arbitre, m.renfort]) if (x) compte.set(x.id, (compte.get(x.id) || 0) + 1);
      const autres = enMemeTemps(m);
      const occupe = (x) => autres.some((o) => o.arbitre?.id === x.id || o.renfort?.id === x.id);
      if (m.arbitre) {
        const permis = listeTerrains(m.arbitre.terrains, NTM);
        if (permis.length && m.terrain && !permis.includes(m.terrain)) m.alertes.push("Arbitre non prévu sur ce terrain.");
        if (occupe(m.arbitre)) m.alertes.push("Arbitre déjà occupé à cette heure.");
      }
      if (m.renfort) {
        if (m.renfort.id === m.arbitre?.id) m.alertes.push("Renfort = arbitrage.");
        else if (occupe(m.renfort)) m.alertes.push("Renfort déjà occupé à cette heure.");
      }
      if (m.terrain && autres.some((o) => o.terrain === m.terrain)) m.alertes.push("Terrain déjà occupé.");
      for (const [e, n] of [[m.e1, 1], [m.e2, 2]])
        if (e && autres.some((o) => o.e1?.id === e.id || o.e2?.id === e.id)) m.alertes.push(`Équipe ${n} déjà en match.`);
      if (m.phase === "finale") {
        if (m.joue && !m.forfait && m.score1 === m.score2) m.alertes.push("Match nul : inclure les tirs au but dans le score.");
        if ((!m.e1 || !m.e2) && (m.score1 != null || m.score2 != null)) m.alertes.push("Équipes pas encore connues : score non pris en compte.");
      }
    }

    const places = (r.places || []).map((code, i) => ({ place: i + 1, nom: resoudre(code, finales).nom })).filter((p) => p.nom);
    const arb = [...arbitres].sort((a, b) => a.ordre - b.ordre).map((a) => ({ ...a, designation: designation(a), nb: compte.get(a.id) || 0 }));
    return { matchs, finales, classement, lettres, places, arbitres: arb, nTer, dMatch, dCreneau };
  }

  return { LETTRES, NTM, DEFAUT, reglages, calculer, listeTerrains, minutes, hhmm, designation, rangPoule };
})();

if (typeof module !== "undefined") module.exports = TH;
