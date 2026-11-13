// Arabic names for the cities and provinces in the imported inventory. City names are stored as imported
// (usually in English); this only changes how they are shown when the interface is in Arabic.
// Unknown names are shown unchanged rather than guessed.

const cities: Record<string, string> = {
  baghdad: "بغداد",
  basra: "البصرة",
  basrah: "البصرة",
  mosul: "الموصل",
  erbil: "أربيل",
  arbil: "أربيل",
  hawler: "أربيل",
  sulaymaniyah: "السليمانية",
  sulaimaniyah: "السليمانية",
  sulaimaniya: "السليمانية",
  sulaymaniya: "السليمانية",
  slemani: "السليمانية",
  kirkuk: "كركوك",
  najaf: "النجف",
  karbala: "كربلاء",
  kerbala: "كربلاء",
  hilla: "الحلة",
  hillah: "الحلة",
  babil: "بابل",
  babylon: "بابل",
  nasiriyah: "الناصرية",
  nasiriya: "الناصرية",
  amarah: "العمارة",
  amara: "العمارة",
  diwaniyah: "الديوانية",
  diwaniya: "الديوانية",
  kut: "الكوت",
  ramadi: "الرمادي",
  fallujah: "الفلوجة",
  falluja: "الفلوجة",
  baqubah: "بعقوبة",
  baquba: "بعقوبة",
  baqouba: "بعقوبة",
  samarra: "سامراء",
  tikrit: "تكريت",
  duhok: "دهوك",
  dohuk: "دهوك",
  zakho: "زاخو",
  ankawa: "عنكاوا",
  koya: "كويه",
  koysinjaq: "كويه",
  khanaqin: "خانقين",
  haditha: "حديثة",
  hit: "هيت",
  shamiya: "الشامية",
  shamiyah: "الشامية",
  samawah: "السماوة",
  samawa: "السماوة",
  halabja: "حلبجة",
  kufa: "الكوفة",
  anbar: "الأنبار",
  diyala: "ديالى",
  wasit: "واسط",
  maysan: "ميسان",
  missan: "ميسان",
  dhiqar: "ذي قار",
  thiqar: "ذي قار",
  muthanna: "المثنى",
  qadisiyah: "القادسية",
  qadisiya: "القادسية",
  salahuddin: "صلاح الدين",
  salahaldin: "صلاح الدين",
  nineveh: "نينوى",
  ninawa: "نينوى",
  qaim: "القائم",
  rutba: "الرطبة",
  zubair: "الزبير",
  abualkhasib: "أبو الخصيب",
  ummqasr: "أم قصر",
  faw: "الفاو",
  balad: "بلد",
  baiji: "بيجي",
  shirqat: "الشرقاط",
  tuzkhurmatu: "طوز خورماتو",
  chamchamal: "جمجمال",
  ranya: "رانية",
  rania: "رانية",
  soran: "سوران",
  shaqlawa: "شقلاوة",
  akre: "عقرة",
  aqrah: "عقرة",
  sinjar: "سنجار",
  talafar: "تلعفر",
  mahmudiyah: "المحمودية",
  abughraib: "أبو غريب",
  taji: "التاجي",
  kadhimiya: "الكاظمية",
  kadhimiyah: "الكاظمية",
  mandali: "مندلي",
  muqdadiyah: "المقدادية",
  suwaira: "الصويرة",
  hashimiyah: "الهاشمية",
  musayyib: "المسيب",
  iskandariya: "الإسكندرية",
  shatra: "الشطرة",
  rifai: "الرفاعي",
  qalatsukar: "قلعة سكر",
  suqalshuyukh: "سوق الشيوخ",
  aligharbi: "علي الغربي",
  majaralkabir: "المجر الكبير",
  qurna: "القرنة",
  shattalarab: "شط العرب",
  hamdaniya: "الحمدانية",
  kura: "كورة",
  karachi: "كراتشي",
  unspecifiedcity: "مدينة غير محددة",
  unspecified: "غير محدد",
};

// "Al-Najaf", "al najaf" and "Najaf" all match "najaf".
const key = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(al|el)[\s-]+/, "")
    .replace(/[^a-z]/g, "");

function translatePart(part: string) {
  const trimmed = part.trim();
  return cities[key(trimmed)] ?? trimmed;
}

// "Kura (as listed)" and "Unspecified City, Anbar" are labels made at import; their parts are translated one by one.
export function cityNameAr(city: string) {
  const asListed = /\s*\(as listed\)\s*$/i;
  const suffix = asListed.test(city) ? " (كما وردت)" : "";
  return city.replace(asListed, "").split(",").map(translatePart).join("، ") + suffix;
}

export function cityName(city: string | null | undefined, ar: boolean) {
  const value = (city ?? "").trim();
  if (!value || !ar) return value;
  return cityNameAr(value);
}
