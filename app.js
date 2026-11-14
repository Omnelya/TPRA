// Tournoi de handball — application web. Affichage public sans identifiant, saisie après connexion.
const VERSION = "2.2";
const SUPABASE_URL = "https://izzwdgtwzmtlhiqkgewv.supabase.co";
const SUPABASE_CLE = "sb_publishable_Y7E0XgCzbJK9wSB2guIt3g_x8AdV8aN"; // clé publique : les droits sont contrôlés par la base
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);

const etat = {
  session: null, role: null, tournois: [], id: null, equipes: [], arbitres: [], saisies: [], acces: [], calc: null,
  onglet: "matchs", filtre: { poule: "", terrain: "", etat: "", texte: "" }, groupe: "heure",
  message: "", connexion: false, aConfirmer: "", ouvert: "",
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
// un identifiant sans « @ » devient une adresse interne : aucun e-mail n'est jamais envoyé
const DOMAINE = "@tpra.local";
const versEmail = (identifiant) => { const i = identifiant.trim().toLowerCase(); return i.includes("@") ? i : i + DOMAINE; };
const identifiant = (email) => String(email || "").replace(DOMAINE, "");
function dire(texte, erreur) {
  etat.message = erreur ? `${texte} (${erreur.message || erreur})` : texte;
  afficher();
}
const trait = (d) => `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONES = {
  matchs: trait('<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>'),
  classement: trait('<path d="M5 20V10M12 20V4M19 20v-7"></path>'),
  finales: trait('<path d="M7 4h10v5a5 5 0 0 1-10 0V4zM12 14v4M8 20h8M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"></path>'),
  reglages: trait('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"></path><circle cx="16" cy="7" r="2"></circle><circle cx="8" cy="17" r="2"></circle>'),
};
const COULEURS = [["#2B2D42", "#FFFFFF"], ["#FFC857", "#2B2D42"], ["#1B6B63", "#FFFFFF"], ["#F2B5A7", "#2B2D42"], ["#5B4B8A", "#FFFFFF"]];

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
  if (etat.session && !etat.role) etat.message = "Ton compte n'a pas encore d'accès : demande à l'organisateur de le créer dans Réglages > Comptes.";
  if (!organisateur() && etat.onglet === "reglages") etat.onglet = "matchs";
  await charger();
}

// ------------------------------------------------------------------ matchs
function carteMatch(m) {
  const ed = !!etat.role, org = organisateur(), cle = esc(m.cle), ouvert = etat.ouvert === m.cle;
  const saisie = (champ, attrs, valeur) => `<input id="${champ}|${cle}" data-s="${champ}" data-cle="${cle}" ${attrs} value="${esc(valeur ?? "")}">`;
  const choixArbitre = (champ, actuel, nom) => `<label>${nom}<select id="${champ}|${cle}" data-s="${champ}" data-cle="${cle}"><option value="">Personne</option>${
    etat.calc.arbitres.map((a) => `<option value="${a.id}"${a.id === actuel?.id ? " selected" : ""}>${esc(a.designation)}</option>`).join("")}</select></label>`;
  const [fond, encre] = COULEURS[((m.terrain || 1) - 1) % COULEURS.length];
  const badge = m.terrain ? `<span class="terrain" style="background:${fond};color:${encre}" aria-label="Terrain ${m.terrain}">T${m.terrain}</span>`
    : `<span class="terrain vide" aria-label="Terrain à définir">?</span>`;
  let centre;
  if (m.forfait) centre = `<span class="mot">forfait</span>`;
  else if (ed && m.e1 && m.e2) centre = saisie("score1", `class="score" type="number" min="0" inputmode="numeric" aria-label="Score ${esc(m.nom1)}"`, m.score1)
    + saisie("score2", `class="score" type="number" min="0" inputmode="numeric" aria-label="Score ${esc(m.nom2)}"`, m.score2);
  else if (m.joue) centre = `<b class="resultat">${m.score1} – ${m.score2}</b>`;
  else centre = `<span class="mot">${m.e1 && m.e2 ? "à jouer" : "contre"}</span>`;
  const classe = (e, autre) => "eq" + (m.joue && m.vainqueur === e && e ? " gagne" : m.joue && m.vainqueur === autre && autre ? " perd" : "");
  const arbitres = [TH.designation(m.arbitre), TH.designation(m.renfort)].filter(Boolean).join(" + ");
  const detail = [etat.groupe !== "heure" && m.phase === "poule" ? m.heure : "", m.phase === "poule" ? "Poule " + m.poule : m.intitule,
    m.forfait ? "Forfait de " + (m.forfait === 1 ? m.nom1 : m.nom2) : "", ed && arbitres ? "Arbitres : " + arbitres : ""].filter(Boolean).map(esc).join(" · ");
  const plus = !ed ? "" : `<button class="plus" data-action="plus" data-cle="${cle}" aria-expanded="${ouvert}">${ouvert ? "Fermer" : org ? "Arbitres, heure, forfait" : "Forfait"}</button>
    ${ouvert ? `<div class="grille options">
      <label>Forfait<select id="forfait|${cle}" data-s="forfait" data-cle="${cle}"><option value="">Pas de forfait</option>
        <option value="1"${m.forfait === 1 ? " selected" : ""}>Forfait de ${esc(m.nom1)}</option><option value="2"${m.forfait === 2 ? " selected" : ""}>Forfait de ${esc(m.nom2)}</option></select></label>
      ${org ? choixArbitre("arbitre_id", m.arbitre, "Arbitrage") + choixArbitre("renfort_id", m.renfort, "Renfort (2e arbitre)")
        + `<label>Heure imposée${saisie("heure", `placeholder="${m.heure || "14:30"}"`, m.heureSaisie)}</label>
           <label>Terrain imposé${saisie("terrain", `type="number" min="1" max="${TH.NTM}" placeholder="${m.terrain ?? ""}"`, m.terrainSaisi)}</label>` : ""}
    </div>` : ""}`;
  return `<article class="match${ed && !m.joue && m.e1 && m.e2 ? " attente" : ""}${m.e1 && m.e2 ? "" : " futur"}">
    <div class="ligne">${badge}<span class="${classe(m.e1, m.e2)}">${esc(m.nom1)}</span><span class="centre">${centre}</span><span class="${classe(m.e2, m.e1)} droite">${esc(m.nom2)}</span></div>
    <p class="detail">${detail}</p>${ed && m.alertes.length ? `<p class="alerte">${esc(m.alertes.join(" "))}</p>` : ""}${plus}</article>`;
}
function listeMatchs(matchs, groupe) {
  const cles = { heure: (m) => [m.min ?? 9999, m.heure || "Heure à définir"], terrain: (m) => [m.terrain ?? 99, m.terrain ? "Terrain " + m.terrain : "Terrain à définir"],
    poule: (m) => [m.poule || "~", m.poule ? "Poule " + m.poule : "Phases finales"] };
  const groupes = new Map();
  for (const m of [...matchs].sort((a, b) => (a.min ?? 9999) - (b.min ?? 9999))) {
    const [ordre, titre] = cles[groupe](m);
    if (!groupes.has(titre)) groupes.set(titre, { ordre, liste: [] });
    groupes.get(titre).liste.push(m);
  }
  return [...groupes].sort((a, b) => (a[1].ordre > b[1].ordre) - (a[1].ordre < b[1].ordre))
    .map(([titre, g]) => `<section class="groupe"><h2>${esc(titre)}</h2>${g.liste.map(carteMatch).join("")}</section>`).join("");
}
function vueMatchs() {
  const c = etat.calc, f = etat.filtre;
  const cherche = f.texte.trim().toLowerCase();
  const lignes = c.matchs.filter((m) => (!f.poule || m.poule === f.poule) && (!f.terrain || String(m.terrain) === f.terrain)
    && (!f.etat || (f.etat === "joues") === m.joue) && (!cherche || `${m.nom1} ${m.nom2}`.toLowerCase().includes(cherche)));
  const choix = (id, attr, libelle, options, actuel, vide) => `<label>${libelle}<select id="${id}" ${attr}>${vide ? `<option value="">${vide}</option>` : ""}${
    options.map(([v, t]) => `<option value="${v}"${actuel === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
  if (!c.matchs.length) return `<p class="note">Aucun match pour l'instant : il faut au moins 2 équipes dans une même poule.</p>`;
  return `<div class="filtres">
      ${choix("groupe", 'data-choix="groupe"', "Ranger par", [["heure", "Heure"], ["terrain", "Terrain"], ["poule", "Poule"]], etat.groupe)}
      ${choix("filtre-poule", 'data-filtre="poule"', "Poule", c.lettres.map((l) => [l, l]), f.poule, "Toutes")}
      ${choix("filtre-terrain", 'data-filtre="terrain"', "Terrain", [...Array(c.nTer)].map((_, i) => [String(i + 1), i + 1]), f.terrain, "Tous")}
      ${choix("filtre-etat", 'data-filtre="etat"', "Matchs", [["a-jouer", "À jouer"], ["joues", "Joués"]], f.etat, "Tous")}
      <label>Équipe<input id="filtre-texte" data-filtre="texte" type="search" value="${esc(f.texte)}" placeholder="Rechercher"></label>
    </div>${listeMatchs(lignes, etat.groupe) || '<p class="note">Aucun match ne correspond à ces choix.</p>'}`;
}

// ------------------------------------------------------------------ classement et finales
function vueClassement() {
  const c = etat.calc, org = organisateur();
  if (!c.lettres.length) return `<p class="note">Aucune poule pour l'instant.</p>`;
  return c.lettres.map((l) => `<section class="groupe"><h2>Poule ${l}${c.classement[l].complete ? " — terminée" : ""}</h2>
    <div class="defile"><table><thead><tr><th>Rang</th><th>Équipe</th><th>Points</th><th title="Matchs joués">J</th><th title="Gagnés">G</th><th title="Nuls">N</th><th title="Perdus">P</th><th title="Forfaits">F</th>
      <th title="Buts marqués">Buts +</th><th title="Buts encaissés">Buts −</th><th>Écart</th>${org ? "<th>Départage</th>" : ""}</tr></thead><tbody>${
    c.classement[l].lignes.map((x) => `<tr><td>${x.rang}</td><td><b>${esc(x.equipe.nom)}</b>${x.remarque.startsWith("⚠") ? `<br><span class="alerte">${x.remarque}</span>` : ""}</td><td><b>${x.pts}</b></td>
      <td>${x.j}</td><td>${x.g}</td><td>${x.n}</td><td>${x.p}</td><td>${x.f}</td><td>${x.bp}</td><td>${x.bc}</td><td>${x.diff > 0 ? "+" : ""}${x.diff}</td>${org ? `<td>${x.exAequo || x.equipe.departage != null
        ? `<input class="score" type="number" min="1" id="dep|${x.equipe.id}" data-dep="${x.equipe.id}" value="${x.equipe.departage ?? ""}" aria-label="Ordre de départage de ${esc(x.equipe.nom)}">` : ""}</td>` : ""}</tr>`).join("")
    }</tbody></table></div></section>`).join("") + (org ? `<p class="note">Départage : en cas d'égalité de points, applique le règlement puis écris l'ordre (1 = devant) dans la dernière colonne.</p>` : "");
}
function vueFinales() {
  const c = etat.calc;
  const final = c.places.length ? `<section class="groupe"><h2>Classement final</h2><div class="defile"><table class="etroit"><thead><tr><th>Place</th><th>Équipe</th></tr></thead><tbody>${
    c.places.map((p) => `<tr><td>${p.place}</td><td><b>${esc(p.nom)}</b></td></tr>`).join("")}</tbody></table></div></section>` : "";
  return (c.finales.length ? listeMatchs(c.finales, "heure") : `<p class="note">Aucune phase finale prévue.</p>`) + final;
}

// ------------------------------------------------------------------ réglages
function vueReglages() {
  const t = tournoi(), r = TH.reglages(t.reglages), c = etat.calc;
  const nombre = (libelle, chemin, min, max) => `<label>${libelle}<input type="number" id="reg-${chemin}" data-reg="${chemin}" data-type="n" min="${min}" max="${max}" value="${esc(lire(r, chemin))}"></label>`;
  const texte = (attr, valeur) => `<input ${attr} value="${esc(valeur ?? "")}">`;
  const confirme = (cle, libelle) => (etat.aConfirmer === cle ? "Confirmer la suppression" : libelle);
  // origines possibles d'une équipe, écrites en mots ; la valeur enregistrée reste un code court
  const rangs = c.lettres.flatMap((l) => c.classement[l].lignes.map((_, i) => [`${i + 1}${l}`, TH.rangPoule(i + 1, l)]));
  const issues = (finales) => finales.flatMap((f) => [[`V-${f.code}`, "Vainqueur " + f.intitule], [`P-${f.code}`, "Perdant " + f.intitule]]);
  const origine = (attr, valeur, avant, avecEquipes) => {
    const v = String(valeur ?? "").trim().toUpperCase();
    const groupes = [["Classement des poules", rangs], ["Matchs précédents", issues(avant)],
      ...(avecEquipes ? [["Une équipe précise", c.lettres.flatMap((l) => c.classement[l].lignes.map((x) => [x.equipe.nom.trim().toUpperCase(), x.equipe.nom]))]] : [])];
    const connu = groupes.some(([, o]) => o.some(([code]) => code === v));
    return `<select ${attr}><option value="">— à choisir —</option>${v && !connu ? `<option value="${esc(v)}" selected>⚠ à choisir de nouveau</option>` : ""}${
      groupes.filter(([, o]) => o.length).map(([nom, o]) => `<optgroup label="${nom}">${o.map(([code, mots]) => `<option value="${esc(code)}"${code === v ? " selected" : ""}>${esc(mots)}</option>`).join("")}</optgroup>`).join("")}</select>`;
  };
  const poules3 = c.lettres.filter((l) => c.classement[l].lignes.length === 3);
  return `
  <section><h2>Tournoi</h2><div class="grille">
    <label>Nom<input id="t-nom" data-tournoi="nom" value="${esc(t.nom)}"></label>
    <label>Date<input id="t-date" data-tournoi="date_tournoi" type="date" value="${esc(t.date_tournoi || "")}"></label></div>
    <p class="boutons"><button data-action="nouveau">Nouveau tournoi</button><button data-action="dupliquer">Dupliquer ce tournoi (sans les scores)</button>
    <button data-action="exporter">Sauvegarde pour Excel</button><button data-action="supprimer" class="danger">${confirme("tournoi", "Supprimer ce tournoi")}</button></p></section>

  <section><h2>1. Équipes</h2><p class="note">Choisis la poule de chaque équipe. Sans poule, l'équipe ne joue pas.</p>
    <div class="grille">${etat.equipes.map((e, i) => `<div class="paire">${texte(`id="eq-nom|${e.id}" data-equipe="nom" data-id="${e.id}" aria-label="Nom de l'équipe ${i + 1}"`, e.nom)}
      <select id="eq-poule|${e.id}" data-equipe="poule" data-id="${e.id}" aria-label="Poule de ${esc(e.nom)}"><option value="">Sans poule</option>${
      [...TH.LETTRES].map((l) => `<option value="${l}"${e.poule === l ? " selected" : ""}>Poule ${l}</option>`).join("")}</select>
      <button data-action="oter-equipe" data-id="${e.id}" class="danger" aria-label="Supprimer ${esc(e.nom)}">${confirme("equipe:" + e.id, "Supprimer")}</button></div>`).join("")}</div>
    <p class="boutons"><button data-action="ajouter-equipe" class="principal">Ajouter une équipe</button></p>
    ${poules3.length ? `<h3>Poules de 3 : premier match</h3><p class="note">Le perdant du premier match joue tout de suite le deuxième match contre la troisième équipe. Choisis les deux équipes du premier match.</p>
    <div class="grille">${poules3.map((l) => { const p = c.classement[l].lignes.map((x) => x.equipe).sort((a, b) => a.ordre - b.ordre), repos = p.find((e) => e.id === r.repos3?.[l]) || p[2];
      return `<label>Poule ${l}<select id="reg-repos3.${l}" data-reg="repos3.${l}">${p.map((e) => `<option value="${e.id}"${e === repos ? " selected" : ""}>${esc(p.filter((x) => x !== e).map((x) => x.nom).join(" – "))}</option>`).join("")}</select></label>`; }).join("")}</div>` : ""}
    <h3>Terrain de chaque poule</h3><p class="note">Exemple : « 1 » ou « 1 et 2 ». Vide = tous les terrains.</p>
    <div class="grille">${c.lettres.map((l) => `<label>Poule ${l} (${c.classement[l].lignes.length} équipes)${texte(`id="reg-terrainsPoule.${l}" data-reg="terrainsPoule.${l}"`, r.terrainsPoule?.[l])}</label>`).join("") || '<p class="note">Aucune poule.</p>'}</div></section>

  <section><h2>2. Horaires et terrains</h2><div class="grille">
    <label>Horaires calculés automatiquement<select id="reg-auto" data-reg="auto" data-type="b"><option value="1"${r.auto ? " selected" : ""}>Oui</option><option value="0"${r.auto ? "" : " selected"}>Non, je les écris moi-même</option></select></label>
    ${nombre("Début : heure", "debutH", 0, 23)}${nombre("Début : minutes", "debutM", 0, 59)}
    ${nombre(`Nombre de terrains (1 à ${TH.NTM})`, "terrains", 1, TH.NTM)}
    ${nombre("Périodes par match (2 = mi-temps)", "periodes", 1, 4)}${nombre("Durée d'une période (min)", "dureePeriode", 1, 60)}
    ${nombre("Pause entre deux périodes (min)", "pausePeriode", 0, 30)}${nombre("Pause entre deux matchs (min)", "pauseMatch", 0, 60)}
    ${nombre("Pause repas après le créneau n° (0 = aucune)", "pauseApres", 0, 99)}${nombre("Durée de la pause repas (min)", "pauseDuree", 0, 240)}</div>
    <p class="note">Un match dure ${c.dMatch} min. Un nouveau match démarre toutes les ${c.dCreneau} min sur chaque terrain.</p></section>

  <section><h2>3. Points</h2><div class="grille">
    ${nombre("Victoire", "points.v", 0, 99)}${nombre("Match nul", "points.n", 0, 99)}${nombre("Défaite", "points.d", 0, 99)}${nombre("Forfait", "points.f", 0, 99)}</div></section>

  <section><h2>4. Arbitres</h2><p class="note">Deux noms sur la même ligne = un binôme. Un seul nom = arbitre seul. Terrains : « 1 et 2 », vide = tous.</p>
    ${c.arbitres.map((a) => `<div class="grille rang"><label>Nom Prénom${texte(`id="arb-nom1|${a.id}" data-arbitre="nom1" data-id="${a.id}"`, a.nom1)}</label>
      <label>Nom Prénom du 2e arbitre${texte(`id="arb-nom2|${a.id}" data-arbitre="nom2" data-id="${a.id}"`, a.nom2)}</label>
      <label>Terrains${texte(`id="arb-terrains|${a.id}" data-arbitre="terrains" data-id="${a.id}"`, a.terrains)}</label>
      <div class="fin"><span class="note">${a.nb} match${a.nb > 1 ? "s" : ""}</span><button data-action="oter-arbitre" data-id="${a.id}" class="danger" aria-label="Supprimer ${esc(a.designation)}">Supprimer</button></div></div>`).join("")}
    <p class="boutons"><button data-action="ajouter-arbitre" class="principal">Ajouter un arbitre ou un binôme</button></p></section>

  <section><h2>5. Phases finales</h2><p class="note">Pour chaque match, choisis d'où viennent les deux équipes. Leur nom s'affichera tout seul dès que la poule ou le match précédent sera terminé.
    L'ordre de passage décide de l'heure : deux matchs avec le même numéro se jouent en même temps sur deux terrains différents.</p>
    ${(r.finales || []).map((f, i) => { const avant = c.finales.filter((x) => x.tour < (+f.tour || 1)); return `<div class="grille rang">
      <label>Nom du match${texte(`id="fin-${i}-intitule" data-fin="${i}.intitule"`, f.intitule)}</label>
      <label>Équipe 1${origine(`id="fin-${i}-e1" data-fin="${i}.e1"`, f.e1, avant, true)}</label>
      <label>Équipe 2${origine(`id="fin-${i}-e2" data-fin="${i}.e2"`, f.e2, avant, true)}</label>
      <label>Ordre de passage${texte(`id="fin-${i}-tour" data-fin="${i}.tour" type="number" min="1"`, f.tour)}</label>
      <label>Terrain<select id="fin-${i}-terrain" data-fin="${i}.terrain"><option value="">Automatique</option>${
        [...Array(c.nTer)].map((_, k) => `<option value="${k + 1}"${+f.terrain === k + 1 ? " selected" : ""}>Terrain ${k + 1}</option>`).join("")}</select></label>
      <div class="fin"><button data-action="oter-finale" data-i="${i}" class="danger" aria-label="Supprimer ${esc(f.intitule)}">Supprimer</button></div></div>`; }).join("")}
    <p class="boutons"><button data-action="ajouter-finale" class="principal">Ajouter un match</button></p>
    <h3>Classement final</h3><p class="note">Une place par équipe engagée (${c.places.length}). Pour chaque place, choisis l'équipe qui l'obtient.</p>
    <div class="grille">${c.places.map((_, i) => `<label>${i + 1}${i ? "e" : "re"} place${origine(`id="place-${i}" data-place="${i}"`, r.places?.[i], c.finales, false)}</label>`).join("")}</div></section>

  <section><h2>6. Comptes</h2><p class="note">Tu crées ici chaque compte avec son identifiant et sa fonction. Organisateur : peut tout modifier. Table de marque : écrit les scores et les forfaits.
    La personne ouvre « Connexion », tape son identifiant et choisit elle-même son mot de passe avec « Première connexion ». Aucun e-mail n'est envoyé.</p>
    ${etat.acces.map((a) => `<div class="paire"><span class="large"><b>${esc(identifiant(a.email))}</b> — ${a.role === "organisateur" ? "organisateur" : "table de marque"}
      <br><span class="note">${a.active ? "mot de passe créé" : "en attente de première connexion"}</span></span>
      ${a.email === etat.session.user.email.toLowerCase() ? '<span class="note">(toi)</span>' : `${a.active && a.email.endsWith(DOMAINE) ? `<button data-action="oublier-mdp" data-email="${esc(a.email)}">Mot de passe oublié</button>` : ""}
        <button data-action="oter-acces" data-email="${esc(a.email)}" class="danger">Supprimer</button>`}</div>`).join("")}
    <form data-form="acces" class="filtres"><label>Identifiant (exemple : table1)<input name="identifiant" required minlength="3" maxlength="60" autocapitalize="none" autocomplete="off"></label>
      <label>Fonction<select name="role"><option value="table">Table de marque</option><option value="organisateur">Organisateur</option></select></label><button class="principal">Créer le compte</button></form></section>`;
}

// ------------------------------------------------------------------ page
function afficher() {
  const actif = document.activeElement;
  const garde = actif?.id && actif.closest?.("#app") ? { id: actif.id, valeur: actif.value } : null;
  const t = tournoi(), org = organisateur();
  const onglets = [["matchs", "Matchs"], ["classement", "Classement"], ["finales", "Finales"], ...(org ? [["reglages", "Réglages"]] : [])];
  const vues = { matchs: vueMatchs, classement: vueClassement, finales: vueFinales, reglages: vueReglages };
  $("#app").innerHTML = `
    <header><div class="tete"><h1>Tournoi de handball</h1>
      ${etat.session ? `<button data-action="deconnexion">Déconnexion</button>` : `<button data-action="connexion">${etat.connexion ? "Fermer" : "Connexion"}</button>`}</div>
      ${etat.tournois.length ? `<label class="invisible" for="choix-tournoi">Tournoi</label><select id="choix-tournoi" data-choix="tournoi">${etat.tournois.map((x) =>
        `<option value="${x.id}"${x.id === etat.id ? " selected" : ""}>${esc(x.nom)}${x.date_tournoi ? " — " + x.date_tournoi.split("-").reverse().join("/") : ""}</option>`).join("")}</select>` : ""}
      ${etat.session ? `<p class="qui">${esc(identifiant(etat.session.user.email))}${etat.role ? ` · ${org ? "organisateur" : "table de marque"}` : ""}</p>` : ""}</header>
    ${etat.connexion && !etat.session ? `<form data-form="connexion" class="filtres connexion"><label>Identifiant<input name="identifiant" autocomplete="username" autocapitalize="none" required></label>
      <label>Mot de passe<input name="mdp" type="password" autocomplete="current-password" minlength="6" required></label>
      <button name="mode" value="entrer" class="principal">Se connecter</button><button name="mode" value="premiere">Première connexion : créer mon mot de passe</button>
      <p class="note">Première connexion : tape l'identifiant donné par l'organisateur, choisis ton mot de passe (8 caractères au moins), puis appuie sur le second bouton.</p></form>` : ""}
    ${etat.message ? `<p class="message" role="status">${esc(etat.message)} <button data-action="fermer-message" aria-label="Fermer le message">Fermer</button></p>` : ""}
    <main>${t ? vues[etat.onglet]() : `<p class="note">Aucun tournoi pour l'instant.</p>${org ? '<p><button data-action="nouveau" class="principal">Créer le premier tournoi</button></p>' : ""}`}
      <p class="pied">Version ${VERSION} · la page se met à jour toute seule toutes les 15 secondes</p></main>
    ${t ? `<nav aria-label="Navigation">${onglets.map(([k, n]) => `<button data-onglet="${k}"${etat.onglet === k ? ' aria-current="page"' : ""}>${ICONES[k]}${n}</button>`).join("")}</nav>` : ""}`;
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
async function ajouter(table, liste, ligne) {
  const { data, error } = await sb.from(table).insert({ tournoi_id: etat.id, ordre: Math.max(-1, ...liste.map((x) => x.ordre)) + 1, ...ligne }).select().single();
  if (error) return dire("Ajout refusé", error);
  liste.push(data);
  calculer();
}
// deux clics pour supprimer : le premier demande confirmation sur le bouton lui-même
function confirmer(cle) {
  if (etat.aConfirmer === cle) { etat.aConfirmer = ""; return true; }
  etat.aConfirmer = cle;
  afficher();
  return false;
}

async function creerTournoi(modele) {
  const { data: t, error } = await sb.from("th_tournois").insert({
    nom: modele ? modele.nom + " (copie)" : "Nouveau tournoi", date_tournoi: new Date().toISOString().slice(0, 10),
    reglages: modele ? modele.reglages : TH.DEFAUT }).select().single();
  if (error) return dire("Création refusée", error);
  const equipes = modele ? etat.equipes.map(({ nom, poule, ordre }) => ({ nom, poule, ordre }))
    : [...Array(8)].map((_, i) => ({ nom: "Equipe " + String.fromCharCode(65 + i), poule: i < 4 ? "A" : "B", ordre: i }));
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
  const match = (m) => [m.phase === "poule" ? "Poule " + m.poule : m.intitule, m.heure, m.terrain, m.nom1, m.score1, m.score2, m.nom2,
    m.forfait ? "Forfait de " + (m.forfait === 1 ? m.nom1 : m.nom2) : "", TH.designation(m.arbitre), TH.designation(m.renfort)];
  const lignes = [[t.nom, t.date_tournoi], [], ["MATCHS"], ["Poule / Match", "Heure", "Terrain", "Équipe 1", "Score 1", "Score 2", "Équipe 2", "Forfait", "Arbitrage", "Renfort"],
    ...c.matchs.map(match), ...c.finales.map(match), [], ["CLASSEMENT"], ["Poule", "Rang", "Équipe", "Points", "Joués", "Gagnés", "Nuls", "Perdus", "Forfaits", "Buts +", "Buts -", "Écart"],
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
  if (d.choix === "tournoi") { location.hash = n.value; return; }
  if (d.choix === "groupe") { etat.groupe = n.value; return afficher(); }
  if (d.filtre) { etat.filtre[d.filtre] = n.value; return afficher(); }
  if (d.s) return sauverSaisie(d.cle, d.s, n.value);
  if (d.dep) return sauverLigne("th_equipes", etat.equipes, d.dep, "departage", n.value === "" ? null : Math.max(1, Math.trunc(+n.value) || 1));
  if (d.equipe) return sauverLigne("th_equipes", etat.equipes, d.id, d.equipe, d.equipe === "poule" ? n.value || null : n.value.trim() || "Équipe");
  if (d.arbitre) return sauverLigne("th_arbitres", etat.arbitres, d.id, d.arbitre, n.value.trim() || (d.arbitre === "nom1" ? "Nom Prénom" : null));
  if (d.tournoi) return sauverLigne("th_tournois", etat.tournois, etat.id, d.tournoi, n.value.trim() || (d.tournoi === "nom" ? "Tournoi" : null));
  if (d.reg) return sauverReglages((r) => poser(r, d.reg, d.type === "n" ? (n.value === "" ? 0 : +n.value) : d.type === "b" ? n.value === "1" : n.value.trim()));
  if (d.fin) {
    const champ = d.fin.split(".")[1];
    const v = ["tour", "terrain"].includes(champ) ? (n.value === "" ? null : +n.value) : n.value.trim() || (champ === "intitule" ? "Match" : "");
    return sauverReglages((r) => poser(r.finales, d.fin, v));
  }
  if (d.place) return sauverReglages((r) => { r.places = [...Array(Math.max(+d.place + 1, r.places?.length || 0))].map((_, i) => (i === +d.place ? n.value : r.places?.[i] || "")); });
});
document.addEventListener("input", (ev) => {
  if (ev.target.dataset.filtre === "texte") { etat.filtre.texte = ev.target.value; afficher(); }
});
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b || b.closest("form")) return;
  const d = b.dataset;
  if (d.onglet) { etat.onglet = d.onglet; etat.aConfirmer = ""; window.scrollTo(0, 0); return afficher(); }
  switch (d.action) {
    case "connexion": etat.connexion = !etat.connexion; return afficher();
    case "deconnexion": return sb.auth.signOut();
    case "fermer-message": etat.message = ""; return afficher();
    case "plus": etat.ouvert = etat.ouvert === d.cle ? "" : d.cle; return afficher();
    case "exporter": return exporter();
    case "nouveau": return creerTournoi(null);
    case "dupliquer": return creerTournoi(tournoi());
    case "supprimer":
      if (!confirmer("tournoi")) return;
      await sb.from("th_tournois").delete().eq("id", etat.id);
      location.hash = ""; etat.id = null;
      return charger();
    case "ajouter-equipe": return ajouter("th_equipes", etat.equipes, { nom: "Nouvelle équipe", poule: null });
    case "oter-equipe":
      if (!confirmer("equipe:" + d.id)) return;
      return ecrire(sb.from("th_equipes").delete().eq("id", d.id), () => (etat.equipes = etat.equipes.filter((e) => e.id !== d.id)));
    case "ajouter-arbitre": return ajouter("th_arbitres", etat.arbitres, { nom1: "Nom Prénom" });
    case "oter-arbitre": return ecrire(sb.from("th_arbitres").delete().eq("id", d.id), () => {
      etat.arbitres = etat.arbitres.filter((a) => a.id !== d.id);
      for (const s of etat.saisies) for (const k of ["arbitre_id", "renfort_id"]) if (s[k] === d.id) s[k] = null;
    });
    case "ajouter-finale": return sauverReglages((r) => {
      let n = r.finales.length + 1;
      while (r.finales.some((f) => String(f.code).toUpperCase() === "M" + n)) n++; // code interne unique, jamais affiché
      r.finales.push({ code: "M" + n, intitule: "Nouveau match", tour: 1, e1: "", e2: "", terrain: null });
    });
    case "oter-finale": return sauverReglages((r) => r.finales.splice(+d.i, 1));
    case "oublier-mdp": return ecrire(sb.from("th_acces").update({ active: false }).eq("email", d.email), () => {
      etat.acces.find((a) => a.email === d.email).active = false;
      etat.message = `${identifiant(d.email)} peut choisir un nouveau mot de passe avec « Première connexion ».`;
    });
    case "oter-acces": return ecrire(sb.from("th_acces").delete().eq("email", d.email), () => (etat.acces = etat.acces.filter((a) => a.email !== d.email)));
  }
});
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target, ev.submitter);
  if (ev.target.dataset.form === "connexion") {
    const identifiants = { email: versEmail(f.get("identifiant")), password: f.get("mdp") };
    if (f.get("mode") === "premiere") {
      const { error } = await sb.functions.invoke("th-comptes", { body: { email: identifiants.email, mot_de_passe: identifiants.password } });
      if (error) return dire(await error.context?.json?.().then((x) => x.erreur, () => null) || "Création du mot de passe impossible : vérifie la connexion internet.");
    }
    const { error } = await sb.auth.signInWithPassword(identifiants);
    if (error) return dire("Connexion refusée : identifiant ou mot de passe incorrect.");
  } else if (ev.target.dataset.form === "acces") {
    const ligne = { email: versEmail(f.get("identifiant")), role: f.get("role") };
    if (!/^[a-z0-9._-]{3,40}@[a-z0-9.-]+$/.test(ligne.email)) return dire("Identifiant refusé : 3 caractères au moins, seulement des lettres sans accent, des chiffres, des points ou des tirets.");
    if (etat.acces.some((a) => a.email === ligne.email)) return dire("Cet identifiant existe déjà.");
    ecrire(sb.from("th_acces").insert(ligne), () => { etat.acces = [...etat.acces, { ...ligne, active: false }]; });
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
