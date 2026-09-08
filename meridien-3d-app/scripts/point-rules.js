// Localisation canonique des points d'acupression.
//
// En MTC un point ne se donne pas en centimètres mais par un repère osseux et
// un nombre de « cun », l'unité proportionnelle au corps. Les divisions sont
// fixes : 9 cun de l'aisselle au pli du coude, 12 du coude au poignet, 17 du
// creux sus-sternal au nombril, 5 du nombril au pubis, 18 du pubis au genou,
// 16 du genou à la malléole. Ce fichier décrit chaque point dans ce système ;
// scripts/place-points.js le convertit en coordonnées sur le modèle.
//
// Conventions
//   torse  : `cun` = hauteur sous le repère `from` ('CV22' ou 'nombril'),
//            `lat` = écart latéral en cun (0 = ligne médiane), `face` = côté.
//   dos    : `vertebre` = niveau vertébral (T3, L2…), `lat` en cun.
//   bras   : `cun` = distance depuis l'aisselle le long du membre
//            (pli du coude 9, pli du poignet 21), `angle` autour du membre —
//            0° paume, 90° côté pouce, 180° dos de la main, 270° côté auriculaire.
//   jambe  : `cun` = distance depuis le pubis (genou 18, malléole 34),
//            `angle` — 0° avant, 90° dehors, 180° arrière, 270° dedans.
//   main / pied : les points se donnent par rapport aux doigts, repérés un par
//            un sur le maillage. `doigt` (1 = pouce, 5 = auriculaire) ou
//            `orteil` (1 = gros orteil) avec `t` (0 = base, 1 = bout),
//            `cote` ('radial' | 'ulnaire' pour la main, 'medial' | 'lateral'
//            pour le pied) et `face` ('dos' | 'palmaire' | 'bout'). Sinon un
//            sinon un repère plan : `avance` (part de la longueur du membre
//            depuis le poignet ou le talon), `entre` (les doigts à l'aplomb
//            desquels se placer), `decal` (en mètres, vers l'auriculaire ou
//            vers l'extérieur du pied) et `face`.
//   tête   : `h` = hauteur relative menton(0)→sommet(1) — ligne des yeux 0,50,
//            base du nez 0,33, bouche 0,19, sourcils 0,57, naissance des
//            cheveux 0,72 —, `lat` en demi-largeurs de tête, `face` =
//            'front' | 'side' | 'top'.

const POINT_RULES = {
  // ---------------- Poumon : bord radial antérieur du bras ----------------
  LU1:  { zone: 'torse', from: 'CV22', cun: 2.0, lat: 6.0, face: 'front' },   // 1er espace intercostal, 6 cun de la ligne médiane
  LU5:  { zone: 'bras', cun: 9.0, angle: 45 },                                 // pli du coude, bord radial du tendon du biceps
  LU6:  { zone: 'bras', cun: 14.0, angle: 60 },                                // 7 cun au-dessus du poignet
  LU7:  { zone: 'bras', cun: 19.5, angle: 75 },                                // 1,5 cun au-dessus du pli du poignet, bord radial
  LU9:  { zone: 'bras', cun: 21.0, angle: 65 },                                // pli du poignet, sur l'artère radiale
  LU10: { zone: 'main', avance: 0.34, entre: [1], decal: 0.010, face: 'palmaire' }, // éminence thénar, milieu du 1er métacarpien
  LU11: { zone: 'main', doigt: 1, t: 0.90, cote: 'radial', face: 'dos' },       // angle de l'ongle du pouce, côté radial

  // ------------- Gros Intestin : bord radial postérieur du bras -------------
  LI1:  { zone: 'main', doigt: 2, t: 0.92, cote: 'radial', face: 'dos' },       // angle de l'ongle de l'index, côté radial
  LI4:  { zone: 'main', avance: 0.44, entre: [2], decal: -0.012 },              // dos de la main, milieu du 2e métacarpien côté pouce
  LI10: { zone: 'bras', cun: 11.0, angle: 125 },                                // 2 cun sous le pli du coude
  LI11: { zone: 'bras', cun: 9.0, angle: 115 },                                 // extrémité latérale du pli du coude
  LI14: { zone: 'bras', cun: 4.5, angle: 135 },                                 // insertion du deltoïde, face latérale du bras
  LI15: { zone: 'epaule', angle: 20 },                                          // dépression antérieure sous l'acromion
  LI20: { zone: 'tete', h: 0.34, lat: 0.22, face: 'front' },                    // aile du nez

  // ---------------- Estomac : face antérieure, ligne mamelonnaire ----------------
  ST1:  { zone: 'tete', h: 0.47, lat: 0.31, face: 'front' },                    // sous la pupille, rebord orbitaire
  ST2:  { zone: 'tete', h: 0.43, lat: 0.31, face: 'front' },                    // trou sous-orbitaire
  ST6:  { zone: 'tete', h: 0.13, lat: 0.72, face: 'side', avance: 0.35 },       // angle de la mâchoire, muscle masséter
  ST8:  { zone: 'tete', h: 0.75, lat: 0.80, face: 'side', avance: 0.55 },       // angle frontal de la ligne des cheveux
  ST25: { zone: 'torse', from: 'nombril', cun: 0, lat: 2.0, face: 'front' },     // 2 cun de part et d'autre du nombril
  ST36: { zone: 'jambe', cun: 21.0, angle: 25 },                                 // 3 cun sous le genou, un travers de doigt en dehors de la crête tibiale
  ST40: { zone: 'jambe', cun: 26.0, angle: 35 },                                 // 8 cun sous le genou
  ST44: { zone: 'pied', avance: 0.83, entre: [2, 3] },                          // dos du pied, devant la commissure des 2e et 3e orteils
  ST45: { zone: 'pied', orteil: 2, t: 0.90, cote: 'lateral' },                  // angle de l'ongle du 2e orteil, côté externe

  // ---------------- Rate : face interne de la jambe ----------------
  SP1:  { zone: 'pied', orteil: 1, t: 0.90, cote: 'medial' },                   // angle de l'ongle du gros orteil, côté interne
  SP3:  { zone: 'pied', avance: 0.70, entre: [1], decal: -0.010, face: 'bordOppose' }, // bord interne, arrière de la tête du 1er métatarsien
  SP6:  { zone: 'jambe', cun: 31.0, angle: 255 },                                // 3 cun au-dessus de la malléole interne, bord postérieur du tibia
  SP9:  { zone: 'jambe', cun: 19.5, angle: 260 },                                 // sous le condyle interne du tibia, en dessous du genou
  SP10: { zone: 'jambe', cun: 16.0, angle: 290 },                                // 2 cun au-dessus du bord interne de la rotule
  SP21: { zone: 'torse', from: 'CV22', cun: 8.0, lat: 6.0, face: 'side' },        // ligne axillaire moyenne, 6e espace intercostal

  // ---------------- Cœur : bord ulnaire antérieur du bras ----------------
  HT1:  { zone: 'bras', cun: 0.5, angle: 340 },                                  // centre du creux axillaire
  HT3:  { zone: 'bras', cun: 9.0, angle: 315 },                                  // extrémité ulnaire du pli du coude
  HT5:  { zone: 'bras', cun: 20.0, angle: 305 },                                 // 1 cun au-dessus du pli du poignet
  HT7:  { zone: 'bras', cun: 21.0, angle: 305 },                                 // pli du poignet, bord ulnaire
  HT9:  { zone: 'main', doigt: 5, t: 0.92, cote: 'radial', face: 'dos' },       // angle de l'ongle de l'auriculaire, côté radial

  // ---------------- Intestin Grêle : bord ulnaire postérieur ----------------
  SI1:  { zone: 'main', doigt: 5, t: 0.92, cote: 'ulnaire', face: 'dos' },      // angle de l'ongle de l'auriculaire, côté ulnaire
  SI3:  { zone: 'main', avance: 0.56, entre: [5], decal: 0.008, face: 'bord' }, // bord ulnaire de la main, tête du 5e métacarpien
  SI8:  { zone: 'bras', cun: 9.5, angle: 240 },                                   // entre olécrâne et épicondyle médial
  SI11: { zone: 'dos', vertebre: 'T4', lat: 3.6, face: 'back' },                  // centre de la fosse sous-épineuse
  SI18: { zone: 'tete', h: 0.40, lat: 0.45, face: 'front' },                    // sous la pommette, bord inférieur de l'os zygomatique
  SI19: { zone: 'tete', h: 0.42, lat: 0.95, face: 'side', avance: 0.25 },       // devant le tragus de l'oreille

  // ---------------- Vessie : deux lignes le long du rachis ----------------
  BL1:  { zone: 'tete', h: 0.50, lat: 0.17, face: 'front' },                    // angle interne de l'œil
  BL2:  { zone: 'tete', h: 0.56, lat: 0.19, face: 'front' },                    // extrémité interne du sourcil
  BL10: { zone: 'nuque', cun: 1.3, lat: 1.3 },                                    // 1,3 cun de part et d'autre, sous l'occiput
  BL13: { zone: 'dos', vertebre: 'T3', lat: 1.5, face: 'back' },
  BL15: { zone: 'dos', vertebre: 'T5', lat: 1.5, face: 'back' },
  BL18: { zone: 'dos', vertebre: 'T9', lat: 1.5, face: 'back' },
  BL20: { zone: 'dos', vertebre: 'T11', lat: 1.5, face: 'back' },
  BL23: { zone: 'dos', vertebre: 'L2', lat: 1.5, face: 'back' },
  BL25: { zone: 'dos', vertebre: 'L4', lat: 1.5, face: 'back' },
  BL40: { zone: 'jambe', cun: 18.0, angle: 180 },                                 // milieu du pli poplité
  BL57: { zone: 'jambe', cun: 26.0, angle: 180 },                                 // pointe du ventre du mollet
  BL60: { zone: 'jambe', cun: 34.0, angle: 140 },                                 // entre malléole externe et tendon d'Achille
  BL67: { zone: 'pied', orteil: 5, t: 0.90, cote: 'lateral' },                  // angle de l'ongle du 5e orteil, côté externe

  // ---------------- Rein : face interne, plante du pied ----------------
  KI1:  { zone: 'pied', avance: 0.57, entre: [2, 3], face: 'palmaire' },        // plante, aux deux tiers de la ligne talon–commissure des 2e et 3e orteils
  KI3:  { zone: 'jambe', cun: 34.0, angle: 220 },                                 // entre malléole interne et tendon d'Achille
  KI6:  { zone: 'jambe', cun: 34.0, angle: 265, bas: 1.0 },                       // 1 cun sous la pointe de la malléole interne
  KI7:  { zone: 'jambe', cun: 32.0, angle: 220 },                                 // 2 cun au-dessus de KI3
  KI27: { zone: 'torse', from: 'CV22', cun: 1.0, lat: 2.0, face: 'front' },        // sous la clavicule, 2 cun de la médiane

  // ---------------- Maître du Cœur : milieu de la face antérieure ----------------
  PC3:  { zone: 'bras', cun: 9.0, angle: 0 },                                     // pli du coude, bord ulnaire du tendon du biceps
  PC6:  { zone: 'bras', cun: 19.0, angle: 0 },                                    // 2 cun au-dessus du pli du poignet
  PC7:  { zone: 'bras', cun: 21.0, angle: 0 },                                    // milieu du pli du poignet
  PC8:  { zone: 'main', avance: 0.47, entre: [2, 3], face: 'palmaire' },        // centre de la paume, entre 2e et 3e métacarpiens
  PC9:  { zone: 'main', doigt: 3, face: 'bout' },                                // pointe du majeur

  // ---------------- Triple Réchauffeur : milieu de la face postérieure ----------------
  TE3:  { zone: 'main', avance: 0.53, entre: [4, 5] },                          // dos de la main, entre les têtes des 4e et 5e métacarpiens
  TE5:  { zone: 'bras', cun: 19.0, angle: 180 },                                  // 2 cun au-dessus du pli du poignet, face dorsale
  TE14: { zone: 'epaule', angle: 160 },                                           // dépression postérieure sous l'acromion
  TE17: { zone: 'tete', h: 0.30, lat: 0.92, face: 'side', avance: -0.1 },       // derrière le lobe de l'oreille
  TE23: { zone: 'tete', h: 0.57, lat: 0.42, face: 'front' },                    // extrémité externe du sourcil

  // ---------------- Vésicule Biliaire : ligne latérale ----------------
  GB1:  { zone: 'tete', h: 0.50, lat: 0.45, face: 'front' },                    // angle externe de l'œil, 0,5 cun en dehors
  GB14: { zone: 'tete', h: 0.63, lat: 0.28, face: 'front' },                    // 1 cun au-dessus du milieu du sourcil
  GB20: { zone: 'nuque', cun: 2.2, lat: 2.2 },                                     // creux sous l'occiput, bord du trapèze
  GB21: { zone: 'epaule', angle: 250, versLeCou: 0.5 },                            // milieu entre C7 et l'acromion
  GB30: { zone: 'hanche', ratio: 0.33 },                                           // tiers externe entre trochanter et hiatus sacré
  GB34: { zone: 'jambe', cun: 19.0, angle: 105 },                                  // sous la tête du péroné
  GB39: { zone: 'jambe', cun: 31.0, angle: 110 },                                  // 3 cun au-dessus de la malléole externe
  GB40: { zone: 'jambe', cun: 34.0, angle: 120, bas: 0.7 },                       // en avant et en dessous de la malléole externe

  // ---------------- Foie : face interne de la jambe ----------------
  LR1:  { zone: 'pied', orteil: 1, t: 0.90, cote: 'lateral' },                  // angle de l'ongle du gros orteil, côté externe
  LR2:  { zone: 'pied', avance: 0.83, entre: [1, 2] },                          // dos du pied, devant la commissure des 1er et 2e orteils
  LR3:  { zone: 'pied', avance: 0.62, entre: [1, 2] },                          // dos du pied, entre 1er et 2e métatarsiens
  LR8:  { zone: 'jambe', cun: 18.0, angle: 250 },                                  // extrémité interne du pli poplité
  LR14: { zone: 'torse', from: 'CV22', cun: 11.0, lat: 4.0, face: 'front' },        // 6e espace intercostal, sous le mamelon

  // ---------------- Vaisseau Conception : ligne médiane antérieure ----------------
  CV3:  { zone: 'torse', from: 'nombril', cun: 4.0, lat: 0, face: 'front' },
  CV4:  { zone: 'torse', from: 'nombril', cun: 3.0, lat: 0, face: 'front' },
  CV6:  { zone: 'torse', from: 'nombril', cun: 1.5, lat: 0, face: 'front' },
  CV8:  { zone: 'torse', from: 'nombril', cun: 0, lat: 0, face: 'front' },          // le nombril lui-même
  CV12: { zone: 'torse', from: 'nombril', cun: -4.0, lat: 0, face: 'front' },       // à mi-chemin entre nombril et appendice xiphoïde
  CV17: { zone: 'torse', from: 'CV22', cun: 6.8, lat: 0, face: 'front' },           // niveau du 4e espace intercostal
  CV22: { zone: 'torse', from: 'CV22', cun: 0, lat: 0, face: 'front' },             // creux sus-sternal
  CV24: { zone: 'tete', h: 0.11, lat: 0, face: 'front' },                       // sillon labio-mentonnier

  // ---------------- Vaisseau Gouverneur : ligne médiane postérieure ----------------
  GV1:  { zone: 'dos', vertebre: 'S5', lat: 0, face: 'back' },
  GV4:  { zone: 'dos', vertebre: 'L2b', lat: 0, face: 'back' },                     // sous l'apophyse de L2
  GV14: { zone: 'dos', vertebre: 'C7b', lat: 0, face: 'back' },                     // sous l'apophyse de C7
  GV16: { zone: 'nuque', cun: 1.0, lat: 0 },                                        // sous l'occiput, ligne médiane
  GV20: { zone: 'tete', h: 1.0, lat: 0, face: 'top' },                              // sommet du crâne
  GV26: { zone: 'tete', h: 0.26, lat: 0, face: 'front' },                       // sillon sous-nasal, au tiers supérieur
};


// ---------------------------------------------------------------
// Points de passage des trajets
// ---------------------------------------------------------------
// Nos données ne retiennent qu'une sélection de points par méridien. Entre deux
// points éloignés — l'ancheville et le thorax pour le Rein, le genou et le
// flanc pour la Rate — une corde tendue ne représente pas le trajet réel du
// canal. Ces jalons, qui ne sont pas des points d'acupression et ne sont donc
// pas cliquables, redonnent au tracé sa route anatomique.
const MERIDIAN_ROUTE = {
  LU: [{ apres: 'LU1', via: [{ zone: 'bras', cun: 2.5, angle: 30 }] }],

  LI: [{ apres: 'LI15', via: [
    { zone: 'tete', h: 0.10, lat: 0.80, face: 'side', avance: 0.3 },
    { zone: 'tete', h: 0.30, lat: 0.62, face: 'side', avance: 0.6 },
  ] }],

  ST: [{ apres: 'ST8', via: [
    { zone: 'tete', h: 0.16, lat: 0.55, face: 'side', avance: 0.5 },
    { zone: 'torse', from: 'CV22', cun: 0.5, lat: 4.0, face: 'front' },
    { zone: 'torse', from: 'CV22', cun: 8.0, lat: 4.0, face: 'front' },
    { zone: 'torse', from: 'nombril', cun: -3.0, lat: 2.0, face: 'front' },
  ] },
  { apres: 'ST25', via: [
    { zone: 'torse', from: 'nombril', cun: 4.0, lat: 2.0, face: 'front' },
    { zone: 'jambe', cun: 3.0, angle: 15 },
    { zone: 'jambe', cun: 12.0, angle: 18 },
  ] }],

  SP: [{ apres: 'SP10', via: [
    { zone: 'jambe', cun: 8.0, angle: 300 },
    { zone: 'torse', from: 'nombril', cun: 3.5, lat: 4.0, face: 'front' },
    { zone: 'torse', from: 'nombril', cun: -2.0, lat: 4.0, face: 'front' },
    { zone: 'torse', from: 'CV22', cun: 8.0, lat: 6.0, face: 'side' },
  ] }],

  SI: [{ apres: 'SI8', via: [
    { zone: 'bras', cun: 4.0, angle: 215 },
    { zone: 'epaule', angle: 195 },
  ] },
  { apres: 'SI11', via: [
    { zone: 'nuque', cun: 2.0, lat: 2.0 },
    { zone: 'tete', h: 0.30, lat: 0.85, face: 'side', avance: 0.2 },
  ] }],

  BL: [{ apres: 'BL2', via: [
    { zone: 'tete', h: 0.98, lat: 0.28, face: 'front' },
    { zone: 'tete', h: 1.0, lat: 0.22, face: 'top' },
    { zone: 'nuque', cun: 1.3, lat: 1.3 },
  ] },
  { apres: 'BL25', via: [
    { zone: 'dos', vertebre: 'S5', lat: 1.5, face: 'back' },
    { zone: 'jambe', cun: 8.0, angle: 180 },
  ] }],

  KI: [{ apres: 'KI7', via: [
    { zone: 'jambe', cun: 24.0, angle: 250 },
    { zone: 'jambe', cun: 19.0, angle: 260 },
    { zone: 'jambe', cun: 8.0, angle: 285 },
    { zone: 'torse', from: 'nombril', cun: 4.0, lat: 0.5, face: 'front' },
    { zone: 'torse', from: 'nombril', cun: 0, lat: 0.5, face: 'front' },
    { zone: 'torse', from: 'nombril', cun: -4.0, lat: 2.0, face: 'front' },
    { zone: 'torse', from: 'CV22', cun: 6.0, lat: 2.0, face: 'front' },
  ] }],

  TE: [{ apres: 'TE5', via: [
    { zone: 'bras', cun: 14.0, angle: 180 },
    { zone: 'bras', cun: 5.0, angle: 175 },
  ] },
  { apres: 'TE14', via: [{ zone: 'nuque', cun: 2.5, lat: 2.5 }] }],

  GB: [{ apres: 'GB21', via: [
    { zone: 'torse', from: 'CV22', cun: 7.0, lat: 6.0, face: 'side' },
    { zone: 'torse', from: 'nombril', cun: -1.0, lat: 6.0, face: 'side' },
  ] },
  { apres: 'GB30', via: [
    { zone: 'jambe', cun: 6.0, angle: 95 },
    { zone: 'jambe', cun: 13.0, angle: 100 },
  ] }],

  LR: [{ apres: 'LR8', via: [
    { zone: 'jambe', cun: 12.0, angle: 265 },
    { zone: 'jambe', cun: 4.0, angle: 285 },
    { zone: 'torse', from: 'nombril', cun: 4.0, lat: 2.5, face: 'front' },
    { zone: 'torse', from: 'nombril', cun: -1.0, lat: 4.0, face: 'front' },
  ] }],

  GV: [{ apres: 'GV20', via: [
    { zone: 'tete', h: 0.95, lat: 0, face: 'front' },
    { zone: 'tete', h: 0.72, lat: 0, face: 'front', avance: 0.95 },
    { zone: 'tete', h: 0.50, lat: 0, face: 'front', avance: 1.0 },
  ] }],
};

module.exports = { POINT_RULES, MERIDIAN_ROUTE };
