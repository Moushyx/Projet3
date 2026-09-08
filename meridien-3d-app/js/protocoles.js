// Protocoles : des ensembles de points travaillés ensemble pour un motif donné.
//
// Ce sont des associations classiques d'acupression, à titre pédagogique. Elles
// ne remplacent ni un diagnostic ni un praticien : en médecine chinoise, le
// choix des points dépend du terrain de la personne, pas seulement du symptôme.
const PROTOCOLES = [
  { id: 'tete', nom: 'Céphalées, migraine', points: ['LI4', 'GB20', 'GV20', 'TE23', 'BL2'],
    conseil: "Commencer par LI4 des deux côtés, puis remonter vers la tête. Pression soutenue, 1 à 2 minutes par point.",
    prudence: "LI4 est à éviter pendant la grossesse." },
  { id: 'sommeil', nom: 'Sommeil difficile', points: ['HT7', 'PC6', 'GV20', 'SP6', 'KI1'],
    conseil: "Le soir, au calme. Pression douce et lente, en respirant. Terminer par KI1 sous les pieds, qui fait redescendre." },
  { id: 'digestion', nom: 'Digestion lourde, ballonnements', points: ['ST36', 'CV12', 'ST25', 'SP6', 'PC6'],
    conseil: "À distance des repas. CV12 et ST25 en pression douce sur le ventre, ST36 plus ferme." },
  { id: 'stress', nom: 'Stress, anxiété', points: ['PC6', 'HT7', 'GV20', 'LR3', 'GB20'],
    conseil: "PC6 et HT7 se travaillent bien assis, discrètement. LR3 fait descendre la tension du haut du corps." },
  { id: 'nuque', nom: 'Nuque et cervicales', points: ['GB20', 'GB21', 'BL10', 'SI3', 'LU7'],
    conseil: "Mobiliser doucement la nuque pendant la pression de SI3, qui agit à distance.",
    prudence: "GB21 est interdit pendant la grossesse." },
  { id: 'lombes', nom: 'Lombalgie', points: ['BL23', 'BL25', 'GV4', 'BL40', 'KI3'],
    conseil: "BL40 est le point maître du dos : le presser fermement pendant que l'on mobilise le bassin." },
  { id: 'rhume', nom: 'Rhume, nez bouché', points: ['LI4', 'LI20', 'GV14', 'BL2', 'LU7'],
    conseil: "LI20 de chaque côté du nez, en pression vers le haut. GV14 réchauffe : on peut le couvrir.",
    prudence: "LI4 est à éviter pendant la grossesse." },
  { id: 'fatigue', nom: 'Fatigue, manque d’énergie', points: ['ST36', 'CV6', 'CV4', 'KI3', 'GV20'],
    conseil: "Le matin de préférence. ST36 est le grand point de tonification : 2 à 3 minutes de chaque côté." },
  { id: 'regles', nom: 'Règles douloureuses', points: ['SP6', 'CV4', 'LR3', 'SP10', 'ST36'],
    conseil: "Chaleur sur le bas-ventre en même temps que la pression de CV4.",
    prudence: "SP6 est formellement interdit pendant la grossesse." },
  { id: 'nausee', nom: 'Nausées, mal des transports', points: ['PC6', 'ST36', 'CV12'],
    conseil: "PC6 est le point de référence : trois doigts au-dessus du pli du poignet, pression continue." },
  { id: 'genou', nom: 'Genou douloureux', points: ['ST36', 'GB34', 'SP9', 'BL40'],
    conseil: "Encadrer le genou : GB34 en dehors, SP9 en dedans, BL40 derrière." },
  { id: 'epaule', nom: 'Épaule douloureuse', points: ['LI15', 'TE14', 'GB21', 'SI11', 'LI4'],
    conseil: "Lever doucement le bras pendant la pression : le geste guide le point.",
    prudence: "GB21 est interdit pendant la grossesse." },
];

if (typeof module !== 'undefined') module.exports = { PROTOCOLES };
