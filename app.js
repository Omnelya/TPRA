// Tournoi de handball — application web. Affichage public sans identifiant, saisie après connexion.
const VERSION = "2.0";
const SUPABASE_URL = "https://izzwdgtwzmtlhiqkgewv.supabase.co";
const SUPABASE_CLE = "sb_publishable_Y7E0XgCzbJK9wSB2guIt3g_x8AdV8aN"; // clé publique : les droits sont contrôlés par la base
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);

const etat = {
  session: null, role: null, tournois: [], id: null, equipes: [], arbitres: [], saisies: [], acces: [], calc: null,
  onglet: "matchs", filtre: { poule: "", terrain: "", etat: "", texte: "" }, tri: "num",
  message: "", connexion: false, aSupprimer: false,
};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tournoi = () => etat.tournois.find((t) => t.id === etat.id) || null;
const organisateur = () => etat.role === "organisateur";
const lire = (o, chemin) => chemin.split(".").reduce((x, k) => x?.[k], o);
function poser(o, chemin, v) {
  const cles = chemin.split("."), fin = cles.pop();
  for (const k of cles) o = o[k] ??= {};
  o[fin] = v;
}
function dire(texte, erreur) {
  etat.message = erreur ? `${texte} (${erreur.message || erreur})` : texte;
  afficher();
}

// ------------------------------------------------------------------ chargement
async function charger() {
  const { data: tournois, error } = await sb.from("th_tournois").select("*")
    .order("date_tournoi", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) return dire("Impossible de lire les tournois : vérifie la connexion internet", error);
  etat.tournois = tournois;
  const voulu = location.hash.slice(1) || etat.id;
  etat.id = (tournois.find((t) => t.id === voulu) || tournois[0])?.id || null;
  if (etat.id) {
    const lit = (table) => sb.from(table).select("*").eq("tournoi_id", etat.id);
    const [e, a, s] = await Promise.all([lit("th_equipes").order("ordre"), lit("th_arbitres").order("ordre"), lit("th_saisies")]);
    if (e.error || a.error || s.error) return dire("Impossible de lire le tournoi", e.error || a.error || s.error);
    [etat.equipes, etat.arbitres, etat.saisies] = [e.data, a.data, s.data];
  } else [etat.equipes, etat.arbitres, etat.saisies] = [[], [], []];
  if (organisateur()) etat.acces = (await sb.from("th_acces").select("*").order("email")).data || [];
  calculer();
}
function calculer() {
  const t = tournoi();
  etat.calc = t ? TH.calculer(t.reglages, etat.equipes, etat.arbitres, etat.saisies) : null;
  afficher();
}
async function lireRole() {
  etat.role = etat.session ? (await sb.rpc("th_role")).data || null : null;
  if (etat.session && !etat.role) etat.message = "Ton compte n'a pas encore d'accès : demande à l'organisateur d'ajouter ton e-mail dans Réglages > Accès.";
  if (!organisateur() && etat.onglet === "reglages") etat.onglet = "matchs";
  await charger();
}

// ------------------------------------------------------------------ affichage
function ligneMatch(m) {
  const ed = !!etat.role, org = organisateur(), cle = esc(m.cle);
  const saisie = (champ, attrs, valeur) => `<input id="${champ}|${cle}" data-s="${champ}" data-cle="${cle}" ${attrs} value="${esc(valeur ?? "")}">`;
  const choixArbitre = (champ, actuel, nom) => `<select id="${champ}|${cle}" data-s="${champ}" data-cle="${cle}" aria-label="${nom}"><option value="">${nom} : —</option>${
    etat.calc.arbitres.map((a) => `<option value="${a.id}"${a.id === actuel?.id ? " selected" : ""}>${esc(a.designation)}</option>`).join("")}</select>`;
  let score;
  if (ed) score = `${saisie("score1", `class="score" type="number" min="0" inputmode="numeric" aria-label="Score ${esc(m.nom1)}"`, m.score1)} – ${
    saisie("score2", `class="score" type="number" min="0" inputmode="numeric" aria-label="Score ${esc(m.nom2)}"`, m.score2)}
    <select id="forfait|${cle}" data-s="forfait" data-cle="${cle}" aria-label="Forfait"><option value="">Pas de forfait</option>
    <option value="1"${m.forfait === 1 ? " selected" : ""}>Forfait équipe 1</option><option value="2"${m.forfait === 2 ? " selected" : ""}>Forfait équipe 2</option></select>`;
  else if (m.forfait) score = `Forfait ${esc(m.forfait === 1 ? m.nom1 : m.nom2)}`;
  else score = m.score1 != null && m.score2 != null ? `<b>${m.score1} – ${m.score2}</b>` : "–";
  const arbitres = org ? choixArbitre("arbitre_id", m.arbitre, "Arbitrage") + choixArbitre("renfort_id", m.renfort, "Renfort")
    : esc([TH.designation(m.arbitre), TH.designation(m.renfort)].filter(Boolean).join(" + "));
  const gagne = (e) => (e && m.vainqueur === e ? ' class="gagne"' : "");
  return `<tr>
    <td>${m.phase === "poule" ? m.num : esc(m.code)}</td>
    <td>${m.phase === "poule" ? `Poule ${m.poule}` : esc(m.intitule)}</td>
    <td>${org ? saisie("heure", `class="court" placeholder="${m.heure || "hh:mm"}" aria-label="Heure manuelle"`, m.heureSaisie) : m.heure}</td>
    <td>${org ? saisie("terrain", `class="score" type="number" min="1" max="${TH.NTM}" placeholder="${m.terrain ?? ""}" aria-label="Terrain manuel"`, m.terrainSaisi) : m.terrain ?? ""}</td>
    <td${gagne(m.e1)}>${esc(m.nom1)}</td><td class="centre">${score}</td><td${gagne(m.e2)}>${esc(m.nom2)}</td>
    <td>${arbitres}</td><td class="alerte">${esc(m.alertes.join(" "))}</td></tr>`;
}
const ENTETES = `<th><button data-tri="num">N°</button></th><th><button data-tri="poule">Poule</button></th><th><button data-tri="heure">Heure</button></th>
  <th><button data-tri="terrain">Terrain</button></th><th>Équipe 1</th><th>Score</th><th>Équipe 2</th><th>Arbitres</th><th>Alertes</th>`;

function vueMatchs() {
  const c = etat.calc, f = etat.filtre;
  const tris = { num: (a, b) => a.num - b.num, poule: (a, b) => a.poule.localeCompare(b.poule) || a.num - b.num,
    heure: (a, b) => (a.min ?? 9999) - (b.min ?? 9999) || a.num - b.num, terrain: (a, b) => (a.terrain ?? 99) - (b.terrain ?? 99) || (a.min ?? 0) - (b.min ?? 0) };
  const cherche = f.texte.trim().toLowerCase();
  const lignes = c.matchs.filter((m) => (!f.poule || m.poule === f.poule) && (!f.terrain || String(m.terrain) === f.terrain)
    && (!f.etat || (f.etat === "joues") === m.joue) && (!cherche || `${m.nom1} ${m.nom2}`.toLowerCase().includes(cherche))).sort(tris[etat.tri]);
  const choix = (nom, libelle, options) => `<label>${libelle} <select id="filtre-${nom}" data-filtre="${nom}"><option value="">Tous</option>${
    options.map(([v, t]) => `<option value="${v}"${f[nom] === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
  return `<div class="filtres">
      ${choix("poule", "Poule", c.lettres.map((l) => [l, l]))}
      ${choix("terrain", "Terrain", [...Array(c.nTer)].map((_, i) => [String(i + 1), i + 1]))}
      ${choix("etat", "État", [["a-jouer", "À jouer"], ["joues", "Joués"]])}
      <label>Équipe <input id="filtre-texte" data-filtre="texte" type="search" value="${esc(f.texte)}" placeholder="Rechercher"></label>
    </div>
    ${c.matchs.length ? `<div class="defile"><table><thead><tr>${ENTETES}</tr></thead><tbody>${lignes.map(ligneMatch).join("")}</tbody></table></div>
      <p class="note">${lignes.length} match(s) affiché(s) sur ${c.matchs.length}. Clique sur N°, Poule, Heure ou Terrain pour trier.</p>`
    : `<p class="note">Aucun match : il faut au moins 2 équipes dans une même poule (Réglages).</p>`}`;
}

function vueClassement() {
  const c = etat.calc, org = organisateur();
  if (!c.lettres.length) return `<p class="note">Aucune poule pour l'instant.</p>`;
  return c.lettres.map((l) => `<h2>Poule ${l}${c.classement[l].complete ? "" : ' <span class="note">(en cours)</span>'}</h2>
    <div class="defile"><table><thead><tr><th>Rang</th><th>Équipe</th><th>Pts</th><th>J</th><th>G</th><th>N</th><th>P</th><th>F</th><th>BP</th><th>BC</th><th>Diff</th><th>Remarque</th>${org ? "<th>Départage</th>" : ""}</tr></thead><tbody>${
    c.classement[l].lignes.map((x) => `<tr><td>${x.rang}</td><td><b>${esc(x.equipe.nom)}</b></td><td><b>${x.pts}</b></td><td>${x.j}</td><td>${x.g}</td><td>${x.n}</td><td>${x.p}</td><td>${x.f}</td>
      <td>${x.bp}</td><td>${x.bc}</td><td>${x.diff > 0 ? "+" : ""}${x.diff}</td><td class="alerte">${x.remarque}</td>${org ? `<td>${x.exAequo || x.equipe.departage != null
        ? `<input class="score" type="number" min="1" id="dep|${x.equipe.id}" data-dep="${x.equipe.id}" value="${x.equipe.departage ?? ""}" aria-label="Ordre de départage de ${esc(x.equipe.nom)}">` : ""}</td>` : ""}</tr>`).join("")
    }</tbody></table></div>`).join("") + (org ? `<p class="note">Départage : en cas d'égalité de points, applique le règlement puis saisis l'ordre (1 = devant).</p>` : "");
}

function vueFinales() {
  const c = etat.calc;
  const final = c.places.length ? `<h2>Classement final</h2><div class="defile"><table class="etroit"><thead><tr><th>Place</th><th>Équipe</th></tr></thead><tbody>${
    c.places.map((p) => `<tr><td>${p.place}</td><td><b>${esc(p.nom)}</b></td></tr>`).join("")}</tbody></table></div>` : "";
  if (!c.finales.length) return `<p class="note">Aucune phase finale prévue.</p>` + final;
  return `<div class="defile"><table><thead><tr><th>Code</th><th>Match</th><th>Heure</th><th>Terrain</th><th>Équipe 1</th><th>Score</th><th>Équipe 2</th><th>Arbitres</th><th>Alertes</th></tr></thead>
    <tbody>${c.finales.map(ligneMatch).join("")}</tbody></table></div>${final}`;
}

function vueReglages() {
  const t = tournoi(), r = TH.reglages(t.reglages), c = etat.calc;
  const nombre = (libelle, chemin, min, max) => `<label>${libelle}<input type="number" id="reg-${chemin}" data-reg="${chemin}" data-type="n" min="${min}" max="${max}" value="${esc(lire(r, chemin))}"></label>`;
  const texte = (attr, valeur, extra = "") => `<input ${attr} value="${esc(valeur ?? "")}" ${extra}>`;
  return `
  <section><h2>Tournoi</h2><div class="grille">
    <label>Nom<input id="t-nom" data-tournoi="nom" value="${esc(t.nom)}"></label>
    <label>Date<input id="t-date" data-tournoi="date_tournoi" type="date" value="${esc(t.date_tournoi || "")}"></label></div>
    <p><button data-action="nouveau">Nouveau tournoi</button> <button data-action="dupliquer">Dupliquer ce tournoi (sans les scores)</button>
    <button data-action="supprimer" class="danger">${etat.aSupprimer ? "Confirmer : tout effacer définitivement" : "Supprimer ce tournoi"}</button></p></section>

  <section><h2>1. Points au classement</h2><div class="grille">
    ${nombre("Victoire", "points.v", 0, 99)}${nombre("Match nul", "points.n", 0, 99)}${nombre("Défaite", "points.d", 0, 99)}${nombre("Forfait", "points.f", 0, 99)}</div></section>

  <section><h2>2. Planning</h2><div class="grille">
    <label>Planning automatique<select id="reg-auto" data-reg="auto" data-type="b"><option value="1"${r.auto ? " selected" : ""}>Oui</option><option value="0"${r.auto ? "" : " selected"}>Non (heures saisies à la main)</option></select></label>
    ${nombre("Début : heures", "debutH", 0, 23)}${nombre("Début : minutes", "debutM", 0, 59)}
    ${nombre("Périodes par match (2 = mi-temps, 3 = tiers-temps)", "periodes", 1, 4)}${nombre("Durée d'une période (min)", "dureePeriode", 1, 60)}
    ${nombre("Pause entre deux périodes (min)", "pausePeriode", 0, 30)}${nombre("Pause entre deux matchs (min)", "pauseMatch", 0, 60)}
    ${nombre(`Nombre de terrains (1 à ${TH.NTM})`, "terrains", 1, TH.NTM)}
    ${nombre("Pause repas après le créneau n° (0 = aucune)", "pauseApres", 0, 99)}${nombre("Durée de la pause repas (min)", "pauseDuree", 0, 240)}</div>
    <p class="note">Un match dure ${c.dMatch} min ; un créneau dure ${c.dCreneau} min.</p></section>

  <section><h2>3. Équipes et poules</h2><p class="note">Laisse la poule vide pour une équipe qui ne participe pas.</p>
    <div class="grille">${etat.equipes.map((e, i) => `<div class="paire"><span>${i + 1}</span>${texte(`id="eq-nom|${e.id}" data-equipe="nom" data-id="${e.id}" aria-label="Nom de l'équipe ${i + 1}"`, e.nom)}
      <select id="eq-poule|${e.id}" data-equipe="poule" data-id="${e.id}" aria-label="Poule de ${esc(e.nom)}"><option value="">—</option>${
      [...TH.LETTRES].map((l) => `<option${e.poule === l ? " selected" : ""}>${l}</option>`).join("")}</select></div>`).join("")}</div>
    <h3>Terrain(s) de chaque poule</h3><p class="note">Exemple : « 1 » ou « 1 et 2 ». Vide = tous les terrains.</p>
    <div class="grille">${c.lettres.map((l) => `<label>Poule ${l} (${c.classement[l].lignes.length} équipes)${texte(`id="reg-terrainsPoule.${l}" data-reg="terrainsPoule.${l}"`, r.terrainsPoule?.[l])}</label>`).join("") || '<p class="note">Aucune poule.</p>'}</div></section>

  <section><h2>4. Arbitres</h2><p class="note">Binôme = deux noms sur la même ligne. Un seul nom = arbitre solo. Terrains : « 1 et 2 », vide = tous.</p>
    <div class="defile"><table><thead><tr><th>Nom Prénom (arbitre 1)</th><th>Nom Prénom (arbitre 2)</th><th>Terrains autorisés</th><th>Matchs</th><th></th></tr></thead><tbody>${
    c.arbitres.map((a) => `<tr>${["nom1", "nom2", "terrains"].map((k) => `<td>${texte(`id="arb-${k}|${a.id}" data-arbitre="${k}" data-id="${a.id}" aria-label="${k}"`, a[k])}</td>`).join("")}
      <td>${a.nb}</td><td><button data-action="oter-arbitre" data-id="${a.id}" aria-label="Supprimer ${esc(a.designation)}">Supprimer</button></td></tr>`).join("")}</tbody></table></div>
    <p><button data-action="ajouter-arbitre">Ajouter un arbitre ou un binôme</button></p></section>

  <section><h2>5. Phases finales</h2><p class="note">Codes : 1A = 1er de la poule A · V-DF1 = vainqueur du match DF1 · P-DF1 = perdant du match DF1 · ou le nom exact d'une équipe.
    Un match ne peut citer que des matchs placés au-dessus de lui. Tour = ordre de passage.</p>
    <div class="defile"><table><thead><tr><th>Code</th><th>Intitulé</th><th>Tour</th><th>Équipe 1</th><th>Équipe 2</th><th>Terrain (vide = auto)</th><th></th></tr></thead><tbody>${
    (r.finales || []).map((f, i) => `<tr>${[["code", "court"], ["intitule", ""], ["tour", "score"], ["e1", "court"], ["e2", "court"], ["terrain", "score"]].map(([k, cl]) =>
      `<td>${texte(`id="fin-${i}-${k}" data-fin="${i}.${k}" class="${cl}" aria-label="${k}"${cl === "score" ? ' type="number" min="1"' : ""}`, f[k])}</td>`).join("")}
      <td><button data-action="oter-finale" data-i="${i}">Supprimer</button></td></tr>`).join("")}</tbody></table></div>
    <p><button data-action="ajouter-finale">Ajouter un match</button></p>
    <h3>Classement final : origine de chaque place</h3>
    <div class="grille">${[...Array(16)].map((_, i) => `<label>Place ${i + 1}${texte(`id="place-${i}" data-place="${i}" class="court"`, r.places?.[i])}</label>`).join("")}</div></section>

  <section><h2>6. Accès</h2><p class="note">Organisateur : tout modifier. Table de marque : saisir les scores et les forfaits. La personne se connecte avec cet e-mail (bouton « Connexion », puis « Créer mon compte » la première fois).</p>
    <div class="defile"><table class="etroit"><thead><tr><th>E-mail</th><th>Rôle</th><th></th></tr></thead><tbody>${
    etat.acces.map((a) => `<tr><td>${esc(a.email)}</td><td>${a.role === "organisateur" ? "Organisateur" : "Table de marque"}</td>
      <td>${a.email === etat.session.user.email.toLowerCase() ? "(toi)" : `<button data-action="oter-acces" data-email="${esc(a.email)}">Supprimer</button>`}</td></tr>`).join("")}</tbody></table></div>
    <form data-form="acces" class="filtres"><label>E-mail <input name="email" type="email" required></label>
      <label>Rôle <select name="role"><option value="table">Table de marque</option><option value="organisateur">Organisateur</option></select></label><button>Ajouter</button></form></section>`;
}

function afficher() {
  const actif = document.activeElement;
  const garde = actif?.id && actif.closest?.("#app") ? { id: actif.id, valeur: actif.value } : null;
  const t = tournoi(), org = organisateur();
  const onglets = [["matchs", "Matchs de poule"], ["classement", "Classement"], ["finales", "Phases finales"], ...(org ? [["reglages", "Réglages"]] : [])];
  const vues = { matchs: vueMatchs, classement: vueClassement, finales: vueFinales, reglages: vueReglages };
  $("#app").innerHTML = `
    <header><h1>Tournoi de handball</h1>
      <div class="barre">
        ${etat.tournois.length ? `<label class="invisible" for="choix-tournoi">Tournoi</label><select id="choix-tournoi" data-choix="tournoi">${etat.tournois.map((x) =>
          `<option value="${x.id}"${x.id === etat.id ? " selected" : ""}>${esc(x.nom)}${x.date_tournoi ? " — " + x.date_tournoi.split("-").reverse().join("/") : ""}</option>`).join("")}</select>` : ""}
        ${t ? '<button data-action="exporter">Exporter (Excel)</button>' : ""}
        ${etat.session ? `<span class="qui">${esc(etat.session.user.email)}${etat.role ? ` · ${org ? "organisateur" : "table de marque"}` : ""}</span><button data-action="deconnexion">Déconnexion</button>`
          : `<button data-action="connexion">${etat.connexion ? "Fermer" : "Connexion"}</button>`}
      </div></header>
    ${etat.connexion && !etat.session ? `<form data-form="connexion" class="filtres connexion"><label>E-mail <input name="email" type="email" autocomplete="username" required></label>
      <label>Mot de passe <input name="mdp" type="password" autocomplete="current-password" minlength="6" required></label>
      <button name="mode" value="entrer">Se connecter</button><button name="mode" value="creer" class="discret">Créer mon compte</button></form>` : ""}
    ${etat.message ? `<p class="message" role="status">${esc(etat.message)} <button data-action="fermer-message" aria-label="Fermer le message">×</button></p>` : ""}
    ${t ? `<nav>${onglets.map(([k, n]) => `<button data-onglet="${k}"${etat.onglet === k ? ' aria-current="page"' : ""}>${n}</button>`).join("")}</nav>
      <main>${vues[etat.onglet]()}</main>`
      : `<main><p class="note">Aucun tournoi pour l'instant.</p>${org ? '<p><button data-action="nouveau">Créer le premier tournoi</button></p>' : ""}</main>`}
    <footer>Version ${VERSION} · mise à jour automatique toutes les 15 secondes</footer>`;
  if (garde) {
    const n = document.getElementById(garde.id);
    if (n) { n.value = garde.valeur; n.focus(); }
  }
}

// ------------------------------------------------------------------ enregistrement
async function ecrire(requete, apres) {
  const { error } = await requete;
  if (error) return dire("Enregistrement refusé", error);
  if (apres) apres();
  calculer();
}
function sauverSaisie(cle, champ, brut) {
  let v = brut.trim() === "" ? null : brut.trim();
  if (v !== null && ["score1", "score2", "forfait", "terrain"].includes(champ)) {
    v = Number(v);
    if (!Number.isInteger(v) || v < 0 || (champ === "terrain" && (v < 1 || v > TH.NTM))) return dire("Valeur refusée : il faut un nombre entier valide.");
  }
  if (v !== null && champ === "heure" && TH.minutes(v) === null) return dire("Heure refusée : écris-la comme 14:30.");
  const ligne = { tournoi_id: etat.id, cle, [champ]: v, maj: new Date().toISOString() };
  // seule la colonne modifiée est envoyée : deux tables de marque ne s'écrasent pas
  ecrire(sb.from("th_saisies").upsert(ligne, { onConflict: "tournoi_id,cle" }), () => {
    const s = etat.saisies.find((x) => x.cle === cle);
    if (s) Object.assign(s, ligne); else etat.saisies.push(ligne);
  });
}
function sauverReglages(modifier) {
  const t = tournoi(), r = structuredClone(TH.reglages(t.reglages));
  modifier(r);
  ecrire(sb.from("th_tournois").update({ reglages: r }).eq("id", t.id), () => (t.reglages = r));
}
const sauverLigne = (table, liste, id, champ, v) =>
  ecrire(sb.from(table).update({ [champ]: v }).eq("id", id), () => (liste.find((x) => x.id === id)[champ] = v));

async function creerTournoi(modele) {
  const { data: t, error } = await sb.from("th_tournois").insert({
    nom: modele ? modele.nom + " (copie)" : "Nouveau tournoi", date_tournoi: new Date().toISOString().slice(0, 10),
    reglages: modele ? modele.reglages : TH.DEFAUT }).select().single();
  if (error) return dire("Création refusée", error);
  const equipes = modele ? etat.equipes.map(({ nom, poule, ordre }) => ({ nom, poule, ordre }))
    : [...Array(16)].map((_, i) => ({ nom: "Equipe " + String.fromCharCode(65 + i), poule: i < 4 ? "A" : i < 8 ? "B" : null, ordre: i }));
  const arbitres = modele ? etat.arbitres.map(({ nom1, nom2, terrains, ordre }) => ({ nom1, nom2, terrains, ordre })) : [];
  const e1 = await sb.from("th_equipes").insert(equipes.map((e) => ({ ...e, tournoi_id: t.id })));
  const e2 = arbitres.length ? await sb.from("th_arbitres").insert(arbitres.map((a) => ({ ...a, tournoi_id: t.id }))) : {};
  if (e1.error || e2.error) etat.message = "Tournoi créé, mais équipes ou arbitres incomplets : " + (e1.error || e2.error).message;
  location.hash = t.id;
  etat.id = t.id;
  etat.onglet = "reglages";
  await charger();
}

function exporter() {
  const c = etat.calc, t = tournoi();
  const cellule = (v) => { const s = String(v ?? ""); return '"' + (/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; }; // pas de formule cachée dans un nom
  const match = (m) => [m.phase === "poule" ? m.num : m.code, m.phase === "poule" ? "Poule " + m.poule : m.intitule, m.heure, m.terrain, m.nom1, m.score1, m.score2, m.nom2,
    m.forfait ? "Forfait équipe " + m.forfait : "", TH.designation(m.arbitre), TH.designation(m.renfort), m.alertes.join(" ")];
  const lignes = [[t.nom, t.date_tournoi], [], ["MATCHS"], ["N°", "Poule / Match", "Heure", "Terrain", "Équipe 1", "Score 1", "Score 2", "Équipe 2", "Forfait", "Arbitrage", "Renfort", "Alertes"],
    ...c.matchs.map(match), ...c.finales.map(match), [], ["CLASSEMENT"], ["Poule", "Rang", "Équipe", "Pts", "J", "G", "N", "P", "F", "BP", "BC", "Diff"],
    ...c.lettres.flatMap((l) => c.classement[l].lignes.map((x) => [l, x.rang, x.equipe.nom, x.pts, x.j, x.g, x.n, x.p, x.f, x.bp, x.bc, x.diff])),
    [], ["CLASSEMENT FINAL"], ...c.places.map((p) => [p.place, p.nom])];
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob(["﻿" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  lien.download = `${t.nom.replace(/[^\p{L}\p{N}]+/gu, "_")}_sauvegarde.csv`;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// ------------------------------------------------------------------ événements
document.addEventListener("change", (ev) => {
  const n = ev.target, d = n.dataset;
  if (d.choix) { location.hash = n.value; return; }
  if (d.filtre) { etat.filtre[d.filtre] = n.value; return afficher(); }
  if (d.s) return sauverSaisie(d.cle, d.s, n.value);
  if (d.dep) return sauverLigne("th_equipes", etat.equipes, d.dep, "departage", n.value === "" ? null : Math.max(1, Math.trunc(+n.value) || 1));
  if (d.equipe) return sauverLigne("th_equipes", etat.equipes, d.id, d.equipe, d.equipe === "poule" ? n.value || null : n.value.trim() || "Équipe");
  if (d.arbitre) return sauverLigne("th_arbitres", etat.arbitres, d.id, d.arbitre, n.value.trim() || (d.arbitre === "nom1" ? "Nom Prénom" : null));
  if (d.tournoi) return sauverLigne("th_tournois", etat.tournois, etat.id, d.tournoi, n.value.trim() || (d.tournoi === "nom" ? "Tournoi" : null));
  if (d.reg) return sauverReglages((r) => poser(r, d.reg, d.type === "n" ? (n.value === "" ? 0 : +n.value) : d.type === "b" ? n.value === "1" : n.value.trim()));
  if (d.fin) return sauverReglages((r) => poser(r.finales, d.fin, n.type === "number" ? (n.value === "" ? null : +n.value) : n.value.trim()));
  if (d.place) return sauverReglages((r) => { r.places = [...Array(16)].map((_, i) => (i === +d.place ? n.value.trim() : r.places?.[i] || "")); });
});
document.addEventListener("input", (ev) => {
  if (ev.target.dataset.filtre === "texte") { etat.filtre.texte = ev.target.value; afficher(); }
});
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b || b.closest("form")) return;
  const d = b.dataset;
  if (d.onglet) { etat.onglet = d.onglet; return afficher(); }
  if (d.tri) { etat.tri = d.tri; return afficher(); }
  if (d.action !== "supprimer") etat.aSupprimer = false;
  switch (d.action) {
    case "connexion": etat.connexion = !etat.connexion; return afficher();
    case "deconnexion": return sb.auth.signOut();
    case "fermer-message": etat.message = ""; return afficher();
    case "exporter": return exporter();
    case "nouveau": return creerTournoi(null);
    case "dupliquer": return creerTournoi(tournoi());
    case "supprimer":
      if (!etat.aSupprimer) { etat.aSupprimer = true; return afficher(); }
      etat.aSupprimer = false;
      await sb.from("th_tournois").delete().eq("id", etat.id);
      location.hash = ""; etat.id = null;
      return charger();
    case "ajouter-arbitre": {
      const { data, error } = await sb.from("th_arbitres").insert({ tournoi_id: etat.id, nom1: "Nom Prénom", ordre: Math.max(-1, ...etat.arbitres.map((a) => a.ordre)) + 1 }).select().single();
      if (error) return dire("Ajout refusé", error);
      etat.arbitres.push(data); return calculer();
    }
    case "oter-arbitre": return ecrire(sb.from("th_arbitres").delete().eq("id", d.id), () => {
      etat.arbitres = etat.arbitres.filter((a) => a.id !== d.id);
      for (const s of etat.saisies) for (const k of ["arbitre_id", "renfort_id"]) if (s[k] === d.id) s[k] = null;
    });
    case "ajouter-finale": return sauverReglages((r) => r.finales.push({ code: "M" + (r.finales.length + 1), intitule: "Match", tour: 1, e1: "", e2: "", terrain: null }));
    case "oter-finale": return sauverReglages((r) => r.finales.splice(+d.i, 1));
    case "oter-acces": return ecrire(sb.from("th_acces").delete().eq("email", d.email), () => (etat.acces = etat.acces.filter((a) => a.email !== d.email)));
  }
});
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target, ev.submitter);
  if (ev.target.dataset.form === "connexion") {
    const identifiants = { email: f.get("email").trim(), password: f.get("mdp") };
    const { error } = f.get("mode") === "creer" ? await sb.auth.signUp(identifiants) : await sb.auth.signInWithPassword(identifiants);
    if (error) return dire("Connexion refusée", error);
    if (f.get("mode") === "creer") dire("Compte créé. Si tu reçois un e-mail de confirmation, clique sur son lien, puis connecte-toi.");
  } else if (ev.target.dataset.form === "acces") {
    const ligne = { email: f.get("email").trim().toLowerCase(), role: f.get("role") };
    ecrire(sb.from("th_acces").upsert(ligne), () => { etat.acces = [...etat.acces.filter((a) => a.email !== ligne.email), ligne]; });
  }
});
window.addEventListener("hashchange", charger);
sb.auth.onAuthStateChange((_, session) => {
  etat.session = session;
  if (session) etat.connexion = false;
  setTimeout(lireRole); // hors du rappel : Supabase bloque les requêtes lancées dedans
});
// shortcut: relecture toutes les 15 s plutôt que temps réel ; passer à Supabase Realtime si le délai gêne.
setInterval(() => { if (!["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) charger(); }, 15000);
