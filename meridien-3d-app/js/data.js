// Données des 12 méridiens principaux + Ren Mai (VC) et Du Mai (VG)
// Positions 3D approximatives et pédagogiques sur un corps stylisé de 1.78 m
// (origine au sol entre les pieds, Y = hauteur, X = latéral, Z = profondeur avant/arrière).
// ⚠️ Ces coordonnées sont illustratives, à but éducatif — pas un outil clinique.
//
// Convention : "pos" est donné pour le côté droit du sujet (x >= 0) ; les méridiens
// bilatéraux sont automatiquement dupliqués en miroir (x négatif) au rendu.
// Les points du Ren Mai / Du Mai sont sur la ligne médiane (x = 0).

const MERIDIANS = [
  {
    id: 'LU', color: '#7ec8e3', bilateral: true,
    name: 'Poumon', namePinyin: 'Fei Jing', element: 'Métal', yinYang: 'Yin (Bras)',
    organ: 'Poumons', organKey: 'lungs',
    description: "Gouverne le Qi et la respiration, régule les liquides organiques et la peau. En lien avec le Gros Intestin.",
    points: [
      { id: 'LU1', name: 'Zhongfu', trad: 'Palais Central', pos: [0.132, 1.368, 0.079], info: "Point Mu (alarme) du Poumon. Toux, oppression thoracique, asthme." },
      { id: 'LU5', name: 'Chize', trad: 'Marais du Coude', pos: [0.19, 1.13, 0.03], info: "Point He (mer). Toux, chaleur du Poumon, douleur du coude." },
      { id: 'LU6', name: 'Kongzui', trad: 'Trou du Milieu', pos: [0.205, 1.00, 0.03], info: "Point Xi (fissure). Hémoptysie, toux aiguë, asthme." },
      { id: 'LU7', name: 'Lieque', trad: 'Brèche Céleste', pos: [0.215, 0.905, 0.02], info: "Point clé du Vaisseau Ren. Rhume, cervicalgie, toux." },
      { id: 'LU9', name: 'Taiyuan', trad: 'Grand Abîme', pos: [0.218, 0.875, 0.01], info: "Point Shu (ruisseau) et point Source. Maître du pouls, toux, poignet." },
      { id: 'LU10', name: 'Yuji', trad: 'Bord du Poisson', pos: [0.225, 0.79, 0.00], info: "Fièvre, mal de gorge, toux." },
      { id: 'LU11', name: 'Shaoshang', trad: 'Marchand Mineur', pos: [0.228, 0.685, 0.00], info: "Point Jing (puits). Mal de gorge aigu, urgence, réanimation." },
    ],
  },
  {
    id: 'LI', color: '#4a90d9', bilateral: true,
    name: 'Gros Intestin', namePinyin: 'Da Chang Jing', element: 'Métal', yinYang: 'Yang (Bras)',
    organ: 'Gros Intestin', organKey: 'largeIntestine',
    description: "Élimination, transit intestinal. Contrôle la peau et le nez avec le Poumon.",
    points: [
      { id: 'LI1', name: 'Shangyang', trad: 'Yang Naissant', pos: [0.235, 0.665, 0.01], info: "Point Jing (puits). Mal de gorge, fièvre, urgence." },
      { id: 'LI4', name: 'Hegu', trad: 'Vallée de la Jonction', pos: [0.24, 0.71, 0.02], info: "Point Source majeur. Douleur, céphalées, points du visage, analgésie." },
      { id: 'LI10', name: 'Shousanli', trad: 'Trois Lieues du Bras', pos: [0.205, 1.075, 0.02], info: "Douleur du coude/avant-bras, troubles digestifs." },
      { id: 'LI11', name: 'Quchi', trad: 'Étang au Coude', pos: [0.20, 1.125, 0.02], info: "Point He (mer). Fièvre, hypertension, allergies, coude." },
      { id: 'LI14', name: 'Binao', trad: 'Bras Lumineux', pos: [0.185, 1.24, 0.01], info: "Douleur d'épaule et de bras." },
      { id: 'LI15', name: 'Jianyu', trad: 'Os de l\'Épaule', pos: [0.185, 1.40, 0.00], info: "Périarthrite de l'épaule, douleur du bras." },
      { id: 'LI20', name: 'Yingxiang', trad: 'Accueil des Parfums', pos: [0.02, 1.615, 0.095], info: "Sinusite, rhinite, anosmie." },
    ],
  },
  {
    id: 'ST', color: '#f4a836', bilateral: true,
    name: 'Estomac', namePinyin: 'Wei Jing', element: 'Terre', yinYang: 'Yang (Jambe)',
    organ: 'Estomac', organKey: 'stomach',
    description: "Réception et décomposition des aliments (avec la Rate). Source du Qi et du Sang post-natal.",
    points: [
      { id: 'ST1', name: 'Chengqi', trad: 'Récipient des Larmes', pos: [0.03, 1.655, 0.10], info: "Troubles oculaires, larmoiement." },
      { id: 'ST2', name: 'Sibai', trad: 'Blancheur des Quatre Directions', pos: [0.035, 1.63, 0.10], info: "Douleur faciale, sinusite." },
      { id: 'ST6', name: 'Jiache', trad: 'Char de la Mâchoire', pos: [0.048, 1.585, 0.042], info: "Douleur mandibulaire, paralysie faciale." },
      { id: 'ST8', name: 'Touwei', trad: 'Lien de la Tête', pos: [0.09, 1.73, 0.06], info: "Céphalées frontales, vertige." },
      { id: 'ST25', name: 'Tianshu', trad: 'Pivot Céleste', pos: [0.09, 1.02, 0.10], info: "Point Mu du Gros Intestin. Diarrhée, constipation, troubles digestifs." },
      { id: 'ST36', name: 'Zusanli', trad: 'Trois Lieues de Jambe', pos: [0.10, 0.395, 0.045], info: "Point He (mer), tonification majeure. Digestion, immunité, fatigue." },
      { id: 'ST40', name: 'Fenglong', trad: 'Abondance Luxuriante', pos: [0.115, 0.235, 0.04], info: "Point Luo. Élimine les glaires/humidité, toux grasse." },
      { id: 'ST44', name: 'Neiting', trad: 'Cour Intérieure', pos: [0.06, 0.03, 0.06], info: "Douleur dentaire, fièvre, troubles digestifs." },
      { id: 'ST45', name: 'Lidui', trad: 'Échange Rigoureux', pos: [0.065, 0.01, 0.08], info: "Point Jing (puits). Distension abdominale, cauchemars." },
    ],
  },
  {
    id: 'SP', color: '#f2c94c', bilateral: true,
    name: 'Rate', namePinyin: 'Pi Jing', element: 'Terre', yinYang: 'Yin (Jambe)',
    organ: 'Rate / Pancréas', organKey: 'spleen',
    description: "Transforme et transporte les aliments, contrôle le Sang et les muscles. Origine du Qi post-natal.",
    points: [
      { id: 'SP1', name: 'Yinbai', trad: 'Blancheur Cachée', pos: [0.025, 0.01, 0.05], info: "Point Jing (puits). Saignements, troubles digestifs, anxiété." },
      { id: 'SP3', name: 'Taibai', trad: 'Suprême Blancheur', pos: [0.10, 0.045, 0.06], info: "Point Source. Fatigue, troubles digestifs." },
      { id: 'SP6', name: 'Sanyinjiao', trad: 'Réunion des Trois Yin', pos: [0.09, 0.235, 0.03], info: "Croisement des 3 méridiens Yin de jambe. Gynécologie, digestion, sommeil." },
      { id: 'SP9', name: 'Yinlingquan', trad: 'Source du Tertre Yin', pos: [0.046, 0.452, 0.012], info: "Élimine l'humidité, œdèmes, troubles urinaires." },
      { id: 'SP10', name: 'Xuehai', trad: 'Mer du Sang', pos: [0.11, 0.52, 0.06], info: "Régule le Sang, troubles gynécologiques, peau." },
      { id: 'SP21', name: 'Dabao', trad: 'Grand Enveloppement', pos: [0.19, 1.28, -0.03], info: "Point Luo général de la Rate. Douleurs thoraciques diffuses." },
    ],
  },
  {
    id: 'HT', color: '#e74c3c', bilateral: true,
    name: 'Cœur', namePinyin: 'Xin Jing', element: 'Feu', yinYang: 'Yin (Bras)',
    organ: 'Cœur', organKey: 'heart',
    description: "Abrite le Shen (esprit/conscience), gouverne le Sang et les vaisseaux.",
    points: [
      { id: 'HT1', name: 'Jiquan', trad: 'Source Suprême', pos: [0.15, 1.395, -0.02], info: "Douleur thoracique, aisselle, anxiété." },
      { id: 'HT3', name: 'Shaohai', trad: 'Petite Mer', pos: [0.185, 1.115, -0.02], info: "Point He (mer). Douleur du coude, anxiété." },
      { id: 'HT5', name: 'Tongli', trad: 'Communication Interne', pos: [0.205, 0.90, -0.01], info: "Point Luo. Palpitations, aphasie, anxiété." },
      { id: 'HT7', name: 'Shenmen', trad: 'Porte de l\'Esprit', pos: [0.213, 0.865, -0.01], info: "Point Source. Insomnie, anxiété, palpitations — point clé du Shen." },
      { id: 'HT9', name: 'Shaochong', trad: 'Petit Galop', pos: [0.222, 0.685, -0.01], info: "Point Jing (puits). Perte de conscience, palpitations." },
    ],
  },
  {
    id: 'SI', color: '#ff6f91', bilateral: true,
    name: 'Intestin Grêle', namePinyin: 'Xiao Chang Jing', element: 'Feu', yinYang: 'Yang (Bras)',
    organ: 'Intestin Grêle', organKey: 'smallIntestine',
    description: "Sépare le pur de l'impur dans la digestion. Lié au Cœur.",
    points: [
      { id: 'SI1', name: 'Shaoze', trad: 'Petit Marais', pos: [0.232, 0.665, -0.01], info: "Point Jing (puits). Lactation, mal de gorge." },
      { id: 'SI3', name: 'Houxi', trad: 'Ruisseau Postérieur', pos: [0.276, 0.716, 0.006], info: "Point clé du Vaisseau Gouverneur. Raideur nuque/dos, fièvre." },
      { id: 'SI8', name: 'Xiaohai', trad: 'Petite Mer', pos: [0.20, 1.12, -0.03], info: "Point He (mer). Douleur du coude, névralgie du cubital." },
      { id: 'SI11', name: 'Tianzong', trad: 'Ancêtre Céleste', pos: [0.11, 1.37, -0.10], info: "Douleur scapulaire, épaule." },
      { id: 'SI18', name: 'Quanliao', trad: 'Os de la Pommette', pos: [0.06, 1.615, 0.09], info: "Douleur faciale, paralysie faciale." },
      { id: 'SI19', name: 'Tinggong', trad: 'Palais de l\'Écoute', pos: [0.075, 1.615, 0.01], info: "Acouphènes, surdité, douleur de l'oreille." },
    ],
  },
  {
    id: 'BL', color: '#2c3e91', bilateral: true,
    name: 'Vessie', namePinyin: 'Pang Guang Jing', element: 'Eau', yinYang: 'Yang (Jambe)',
    organ: 'Vessie', organKey: 'bladder',
    description: "Le plus long méridien : longe tout le dos, porte les points Shu du dos reliés à chaque organe. Élimination des liquides.",
    points: [
      { id: 'BL1', name: 'Jingming', trad: 'Brillance Oculaire', pos: [0.015, 1.655, 0.10], info: "Troubles oculaires de toutes sortes." },
      { id: 'BL2', name: 'Zanzhu', trad: 'Bambous Réunis', pos: [0.02, 1.675, 0.10], info: "Céphalées, troubles oculaires." },
      { id: 'BL10', name: 'Tianzhu', trad: 'Pilier Céleste', pos: [0.024, 1.508, -0.048], info: "Cervicalgie, céphalées occipitales." },
      { id: 'BL13', name: 'Feishu', trad: 'Shu du Poumon', pos: [0.04, 1.365, -0.10], info: "Point Shu du dos du Poumon. Toux, asthme, affections respiratoires." },
      { id: 'BL15', name: 'Xinshu', trad: 'Shu du Cœur', pos: [0.04, 1.30, -0.10], info: "Point Shu du dos du Cœur. Anxiété, palpitations, insomnie." },
      { id: 'BL18', name: 'Ganshu', trad: 'Shu du Foie', pos: [0.04, 1.135, -0.09], info: "Point Shu du dos du Foie. Troubles hépatiques, yeux, colère." },
      { id: 'BL20', name: 'Pishu', trad: 'Shu de la Rate', pos: [0.04, 1.06, -0.09], info: "Point Shu du dos de la Rate. Digestion, fatigue." },
      { id: 'BL23', name: 'Shenshu', trad: 'Shu du Rein', pos: [0.04, 0.985, -0.08], info: "Point Shu du dos du Rein. Lombalgie, fatigue, énergie vitale." },
      { id: 'BL25', name: 'Dachangshu', trad: 'Shu du Gros Intestin', pos: [0.04, 0.92, -0.08], info: "Point Shu du dos du Gros Intestin. Lombalgie, constipation." },
      { id: 'BL40', name: 'Weizhong', trad: 'Milieu du Pli', pos: [0.05, 0.47, -0.03], info: "Point He (mer), point maître du dos. Lombalgie, sciatique." },
      { id: 'BL57', name: 'Chengshan', trad: 'Soutien de la Montagne', pos: [0.045, 0.235, -0.04], info: "Crampes du mollet, sciatique, hémorroïdes." },
      { id: 'BL60', name: 'Kunlun', trad: 'Mont Kunlun', pos: [0.065, 0.085, -0.02], info: "Céphalées, lombalgie, douleur de cheville." },
      { id: 'BL67', name: 'Zhiyin', trad: 'Atteinte du Yin', pos: [0.055, 0.005, 0.06], info: "Point Jing (puits). Version fœtale, accouchement difficile, céphalées." },
    ],
  },
  {
    id: 'KI', color: '#1b2a4a', bilateral: true,
    name: 'Rein', namePinyin: 'Shen Jing', element: 'Eau', yinYang: 'Yin (Jambe)',
    organ: 'Reins', organKey: 'kidneys',
    description: "Réserve l'essence (Jing), racine du Yin et du Yang du corps, contrôle les os et la reproduction.",
    points: [
      { id: 'KI1', name: 'Yongquan', trad: 'Source Jaillissante', pos: [0.035, 0.005, 0.03], info: "Point Jing (puits). Réanimation, hypertension, ancrage de l'énergie." },
      { id: 'KI3', name: 'Taixi', trad: 'Grand Torrent', pos: [0.065, 0.085, -0.02], info: "Point Source. Fatigue rénale, acouphènes, lombalgie." },
      { id: 'KI6', name: 'Zhaohai', trad: 'Mer Brillante', pos: [0.055, 0.06, 0.01], info: "Point clé du Vaisseau Yin Qiao. Insomnie, gorge sèche, gynécologie." },
      { id: 'KI7', name: 'Fuliu', trad: 'Retour du Courant', pos: [0.065, 0.155, -0.02], info: "Point Jing (rivière). Sueurs, œdèmes, troubles urinaires." },
      { id: 'KI27', name: 'Shufu', trad: 'Palais du Transport', pos: [0.03, 1.42, 0.08], info: "Toux, oppression thoracique, asthme." },
    ],
  },
  {
    id: 'PC', color: '#a66bbe', bilateral: true,
    name: 'Maître du Cœur', namePinyin: 'Xin Bao Jing', element: 'Feu', yinYang: 'Yin (Bras)',
    organ: 'Péricarde', organKey: 'pericardium',
    description: "Protège le Cœur, régule la circulation et les émotions ; impliqué dans la sexualité et le système circulatoire.",
    points: [
      { id: 'PC3', name: 'Quze', trad: 'Marais du Coude', pos: [0.216, 1.118, 0.044], info: "Point He (mer). Douleur du coude, nausées, chaleur." },
      { id: 'PC6', name: 'Neiguan', trad: 'Barrière Interne', pos: [0.20, 0.905, 0.02], info: "Point clé du Vaisseau Yin Wei. Nausées, anxiété, palpitations — point majeur." },
      { id: 'PC7', name: 'Daling', trad: 'Grand Monticule', pos: [0.205, 0.875, 0.02], info: "Point Source. Anxiété, douleur du poignet." },
      { id: 'PC8', name: 'Laogong', trad: 'Palais du Labeur', pos: [0.19, 0.72, 0.04], info: "Point Ying (source). Chaleur, anxiété, transpiration des mains." },
      { id: 'PC9', name: 'Zhongchong', trad: 'Assaut du Milieu', pos: [0.248, 0.680, 0.022], info: "Point Jing (puits). Urgence, perte de conscience, fièvre." },
    ],
  },
  {
    id: 'TE', color: '#d98cd9', bilateral: true,
    name: 'Triple Réchauffeur', namePinyin: 'San Jiao Jing', element: 'Feu', yinYang: 'Yang (Bras)',
    organ: 'San Jiao (fonction, non organe anatomique)', organKey: 'tripleWarmer',
    description: "Concept fonctionnel régulant les échanges d'eau et d'énergie entre les 3 foyers (thoracique, épigastrique, pelvien).",
    points: [
      { id: 'TE3', name: 'Zhongzhu', trad: 'Îlot du Milieu', pos: [0.235, 0.735, -0.01], info: "Céphalées, acouphènes, douleur des doigts." },
      { id: 'TE5', name: 'Waiguan', trad: 'Barrière Externe', pos: [0.20, 0.905, -0.02], info: "Point clé du Vaisseau Yang Wei. Fièvre, céphalées, douleur du bras." },
      { id: 'TE14', name: 'Jianliao', trad: 'Faille de l\'Épaule', pos: [0.19, 1.395, -0.03], info: "Périarthrite de l'épaule." },
      { id: 'TE17', name: 'Yifeng', trad: 'Écran du Vent', pos: [0.085, 1.60, -0.05], info: "Acouphènes, surdité, paralysie faciale." },
      { id: 'TE23', name: 'Sizhukong', trad: 'Bosquet de Bambous Fins', pos: [0.06, 1.685, 0.06], info: "Céphalées temporales, troubles oculaires." },
    ],
  },
  {
    id: 'GB', color: '#2ecc71', bilateral: true,
    name: 'Vésicule Biliaire', namePinyin: 'Dan Jing', element: 'Bois', yinYang: 'Yang (Jambe)',
    organ: 'Vésicule Biliaire', organKey: 'gallbladder',
    description: "Stocke la bile, gouverne la prise de décision et les tendons. Trajet sinueux sur le côté du corps.",
    points: [
      { id: 'GB1', name: 'Tongziliao', trad: 'Faille de la Pupille', pos: [0.09, 1.655, 0.05], info: "Céphalées temporales, troubles oculaires." },
      { id: 'GB14', name: 'Yangbai', trad: 'Blancheur Yang', pos: [0.075, 1.72, 0.08], info: "Céphalées frontales, paralysie faciale." },
      { id: 'GB20', name: 'Fengchi', trad: 'Étang du Vent', pos: [0.042, 1.562, -0.058], info: "Céphalées, cervicalgie, vertige, rhume — point très utilisé." },
      { id: 'GB21', name: 'Jianjing', trad: 'Puits de l\'Épaule', pos: [0.11, 1.45, -0.03], info: "Tension d'épaule/nuque, lactation." },
      { id: 'GB30', name: 'Huantiao', trad: 'Bond du Bond', pos: [0.13, 0.83, -0.08], info: "Sciatique, douleur de hanche — point majeur du membre inférieur." },
      { id: 'GB34', name: 'Yanglingquan', trad: 'Source du Tertre Yang', pos: [0.135, 0.44, -0.01], info: "Point He (mer), point maître des tendons. Douleur des tendons/genou." },
      { id: 'GB39', name: 'Xuanzhong', trad: 'Clochette Suspendue', pos: [0.11, 0.145, -0.02], info: "Point maître de la moelle. Raideur cervicale, jambes." },
      { id: 'GB40', name: 'Qiuxu', trad: 'Colline en Ruines', pos: [0.10, 0.075, 0.02], info: "Point Source. Douleur de cheville, distension thoracique." },
    ],
  },
  {
    id: 'LR', color: '#27ae60', bilateral: true,
    name: 'Foie', namePinyin: 'Gan Jing', element: 'Bois', yinYang: 'Yin (Jambe)',
    organ: 'Foie', organKey: 'liver',
    description: "Assure la libre circulation du Qi, stocke le Sang, gouverne les tendons et les émotions (colère/frustration).",
    points: [
      { id: 'LR1', name: 'Dadun', trad: 'Gros Généreux', pos: [0.02, 0.005, 0.07], info: "Point Jing (puits). Troubles gynécologiques, hernie." },
      { id: 'LR2', name: 'Xingjian', trad: 'Espace Interstitiel', pos: [0.045, 0.02, 0.06], info: "Colère, céphalées, yeux rouges — draine le feu du Foie." },
      { id: 'LR3', name: 'Taichong', trad: 'Grand Torrent', pos: [0.06, 0.06, 0.05], info: "Point Source majeur. Stress, colère, céphalées, tension — très utilisé." },
      { id: 'LR8', name: 'Ququan', trad: 'Source Sinueuse', pos: [0.11, 0.47, 0.04], info: "Point He (mer). Troubles gynécologiques, douleur du genou interne." },
      { id: 'LR14', name: 'Qimen', trad: 'Porte de l\'Espoir', pos: [0.14, 1.29, 0.08], info: "Point Mu du Foie. Oppression thoracique, irritabilité." },
    ],
  },
  {
    id: 'CV', color: '#e67e22', bilateral: false,
    name: 'Vaisseau Conception', namePinyin: 'Ren Mai', element: '—', yinYang: 'Mer du Yin',
    organ: 'Utérus / abdomen (Champ de Cinabre)', organKey: 'lowerAbdomen',
    description: "Ligne médiane antérieure, « mer des méridiens Yin ». Régule l'utérus, la grossesse et l'énergie originelle (Dan Tian).",
    points: [
      { id: 'CV3', name: 'Zhongji', trad: 'Faîte Suprême', pos: [0, 0.855, 0.06], info: "Point Mu de la Vessie. Troubles urinaires et gynécologiques." },
      { id: 'CV4', name: 'Guanyuan', trad: 'Barrière Originelle', pos: [0, 0.885, 0.07], info: "Point Mu de l'Intestin Grêle. Tonifie l'énergie originelle, fatigue, gynécologie." },
      { id: 'CV6', name: 'Qihai', trad: 'Mer du Qi', pos: [0, 0.925, 0.08], info: "Réservoir de l'énergie vitale. Fatigue générale, tonification." },
      { id: 'CV8', name: 'Shenque', trad: 'Palais de l\'Esprit (Nombril)', pos: [0, 1.02, 0.085], info: "Nombril. Utilisé en moxibustion pour réchauffer et tonifier." },
      { id: 'CV12', name: 'Zhongwan', trad: 'Milieu de l\'Épigastre', pos: [0, 1.12, 0.09], info: "Point Mu de l'Estomac. Digestion, douleur épigastrique." },
      { id: 'CV17', name: 'Danzhong', trad: 'Centre Thoracique', pos: [0, 1.31, 0.10], info: "Point Mu du Péricarde. Oppression thoracique, anxiété, lactation." },
      { id: 'CV22', name: 'Tiantu', trad: 'Cheminée Céleste', pos: [0, 1.485, 0.06], info: "Toux, asthme, boule dans la gorge." },
      { id: 'CV24', name: 'Chengjiang', trad: 'Réceptacle des Fluides', pos: [0, 1.562, 0.047], info: "Paralysie faciale, douleur du menton." },
    ],
  },
  {
    id: 'GV', color: '#8a8f98', bilateral: false,
    name: 'Vaisseau Gouverneur', namePinyin: 'Du Mai', element: '—', yinYang: 'Mer du Yang',
    organ: 'Colonne vertébrale / cerveau', organKey: 'spineBrain',
    description: "Ligne médiane postérieure, « mer des méridiens Yang ». Gouverne la colonne vertébrale, le cerveau et l'énergie Yang.",
    points: [
      { id: 'GV1', name: 'Changqiang', trad: 'Force Durable', pos: [0, 0.80, -0.05], info: "Hémorroïdes, troubles du bas du dos." },
      { id: 'GV4', name: 'Mingmen', trad: 'Porte de la Vie', pos: [0, 0.985, -0.08], info: "Feu vital (Mingmen), lombalgie, fatigue, énergie du Rein." },
      { id: 'GV14', name: 'Dazhui', trad: 'Grande Vertèbre', pos: [0, 1.455, -0.06], info: "Réunion de tous les méridiens Yang. Fièvre, rhume, immunité." },
      { id: 'GV16', name: 'Fengfu', trad: 'Palais du Vent', pos: [0, 1.615, -0.10], info: "Céphalées occipitales, raideur nuque." },
      { id: 'GV20', name: 'Baihui', trad: 'Cent Réunions', pos: [0, 1.79, 0.00], info: "Sommet du crâne, point majeur du Shen. Vertige, mémoire, prolapsus, méditation." },
      { id: 'GV26', name: 'Renzhong', trad: 'Milieu de l\'Homme', pos: [0, 1.585, 0.105], info: "Point de réanimation d'urgence, perte de conscience." },
    ],
  },
];

// Organes stylisés affichés à l'intérieur du buste (formes simplifiées, non anatomiquement exactes)
// Organes, situés sur ce corps-ci.
//
// Les hauteurs sont celles du modèle anatomique : creux sus-sternal à 1,45 m,
// nombril à 1,06, bord supérieur du pubis à 0,85. Les positions précédentes
// dataient du corps dessiné à la main qu'elles accompagnaient ; sur le
// maillage réel, le cadre colique tombait en travers du bassin et les reins
// dans le bas-ventre.
const ORGAN_SHAPES = {
  lungs: { label: 'Poumons', color: '#7ec8e3', parts: [
    { type: 'ellipsoid', pos: [0.075, 1.31, -0.01], scale: [0.055, 0.115, 0.065] },
    { type: 'ellipsoid', pos: [-0.075, 1.31, -0.01], scale: [0.055, 0.115, 0.065] },
  ]},
  heart: { label: 'Cœur', color: '#e74c3c', parts: [
    { type: 'ellipsoid', pos: [-0.025, 1.27, 0.015], scale: [0.05, 0.06, 0.045] },
  ]},
  // Le cadre colique : côlon ascendant à droite, transverse au-dessus du
  // nombril, descendant à gauche.
  largeIntestine: { label: 'Gros Intestin', color: '#4a90d9', parts: [
    { type: 'torus', pos: [0, 1.09, 0.01], scale: [0.085, 0.085, 0.028] },
  ]},
  stomach: { label: 'Estomac', color: '#f4a836', parts: [
    { type: 'ellipsoid', pos: [-0.045, 1.19, 0.02], scale: [0.065, 0.055, 0.045] },
  ]},
  spleen: { label: 'Rate', color: '#f2c94c', parts: [
    { type: 'ellipsoid', pos: [-0.105, 1.22, -0.03], scale: [0.04, 0.055, 0.035] },
  ]},
  smallIntestine: { label: 'Intestin Grêle', color: '#ff6f91', parts: [
    { type: 'ellipsoid', pos: [0, 1.00, 0.02], scale: [0.075, 0.07, 0.05] },
  ]},
  bladder: { label: 'Vessie', color: '#2c3e91', parts: [
    { type: 'ellipsoid', pos: [0, 0.895, 0.02], scale: [0.05, 0.045, 0.04] },
  ]},
  kidneys: { label: 'Reins', color: '#1b2a4a', parts: [
    { type: 'ellipsoid', pos: [0.06, 1.16, -0.06], scale: [0.032, 0.055, 0.028] },
    { type: 'ellipsoid', pos: [-0.06, 1.16, -0.06], scale: [0.032, 0.055, 0.028] },
  ]},
  pericardium: { label: 'Péricarde', color: '#a66bbe', parts: [
    { type: 'ellipsoid', pos: [-0.025, 1.27, 0.015], scale: [0.062, 0.072, 0.058], wire: true },
  ]},
  tripleWarmer: { label: 'San Jiao (3 foyers)', color: '#d98cd9', parts: [
    { type: 'ellipsoid', pos: [0, 1.14, 0], scale: [0.13, 0.30, 0.09], wire: true },
  ]},
  gallbladder: { label: 'Vésicule Biliaire', color: '#2ecc71', parts: [
    { type: 'ellipsoid', pos: [0.075, 1.20, 0.02], scale: [0.022, 0.035, 0.022] },
  ]},
  liver: { label: 'Foie', color: '#27ae60', parts: [
    { type: 'ellipsoid', pos: [0.075, 1.23, 0.01], scale: [0.085, 0.055, 0.055] },
  ]},
  lowerAbdomen: { label: 'Champ de Cinabre (Dan Tian)', color: '#e67e22', parts: [
    { type: 'ellipsoid', pos: [0, 0.93, 0.01], scale: [0.07, 0.07, 0.05], wire: true },
  ]},
  spineBrain: { label: 'Colonne / Cerveau', color: '#8a8f98', parts: [
    { type: 'ellipsoid', pos: [0, 1.67, -0.01], scale: [0.065, 0.07, 0.07], wire: true },
  ]},
};

if (typeof module !== 'undefined') module.exports = { MERIDIANS, ORGAN_SHAPES };
