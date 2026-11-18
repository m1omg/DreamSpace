// Slovak / English text. The language is picked once per visit:
//   ?lang=sk|en in the URL  >  the player's last choice  >  the browser:
//   Slovak (or Czech, which reads Slovak easily) anywhere in the browser's
//   language list -> Slovak, everything else -> English.
// It can be switched at any time from the menu; the page updates in place.
//
// Static text in index.html is marked with data-i18n (text), data-i18n-html
// (text with markup), data-i18n-title and data-i18n-aria (attributes).

const STRINGS = {
  sk: {
    'doc.title': 'DreamSpace – Lagúna pri Červenom mori',
    'menu.sub': 'Lagúna pri Červenom mori',
    'menu.story': 'Dovolenka pri Červenom mori. Pred plážou rezortu leží plytká tyrkysová lagúna. Ďalej od brehu sa more znova splytčuje – bahno, mangrovy a úzke kanály. Plavčík vraj neodporúča chodiť za bójky.',
    'menu.paused': 'Pauza. Perly, ktoré máš, ti zostanú.',
    'menu.pausedDream': 'Sen počká. Perly, ktoré máš, ti zostanú.',
    'menu.goal': 'Nájdi <b>{n} perál</b> a vráť sa s nimi na pláž.',
    'menu.controls': 'Ovládanie',
    'menu.moves': 'Bunnyhop',
    'menu.tip1': 'V plytčine sa brodíš pomaly – <b>skáč</b>.',
    'menu.tip2': 'Drž skok: skáčeš ďalej automaticky a naberáš rýchlosť.',
    'menu.tip3': 'Pusť ho a stlač <b>tesne pred dopadom</b>: perfektný hop, oveľa viac rýchlosti.',
    'menu.tip4': 'Pozor na <b>trnuchy</b> na dne plytčín a na <b>perutýny</b> pri koraloch – sú jedovaté.',
    'menu.settings': 'Nastavenia a klávesy',
    'menu.quality': 'Kvalita',
    'q.low': 'Nízka', 'q.medium': 'Stredná', 'q.high': 'Vysoká',
    'menu.sens': 'Citlivosť myši',
    'menu.fov': 'Zorné pole',
    'menu.invert': 'Obrátiť os Y',
    'menu.bindHelp': 'Klikni na políčko a stlač kláves, tlačidlo myši alebo pohni kolieskom. Backspace väzbu zmaže, Esc zruší.',
    'menu.bindReset': 'Obnoviť predvolené',
    'menu.lang': 'Jazyk',
    'menu.play': 'Hrať',
    'menu.continue': 'Pokračovať',
    'menu.loading': 'Načítavam…',
    'menu.ready': 'Klikni na „Hrať“ – myš sa uzamkne do hry. Esc ju uvoľní.',
    'menu.readyTouch': 'Dotyk: ľavý palec pohyb, pravý rozhľad, HOP skok.',
    'keys.move': '{f} {l} {b} {r} pohyb · <kbd>myš</kbd> rozhľad',
    'keys.jump': '{k} skok / hore vo vode',
    'keys.dive': '{k} potopiť sa',
    'keys.sprint': '{k} šprint / rýchle plávanie',
    'keys.mute': '{k} zvuk · <kbd>Esc</kbd> pauza',
    'bind.wait': 'stlač…',
    'act.forward': 'Dopredu', 'act.back': 'Dozadu', 'act.left': 'Doľava', 'act.right': 'Doprava',
    'act.jump': 'Skok / nahor vo vode', 'act.dive': 'Potopiť sa', 'act.sprint': 'Šprint / rýchle plávanie', 'act.mute': 'Zvuk',
    'key.Space': 'Medzerník', 'key.ShiftLeft': 'Ľ Shift', 'key.ShiftRight': 'P Shift', 'key.ControlLeft': 'Ľ Ctrl', 'key.ControlRight': 'P Ctrl',
    'key.AltLeft': 'Ľ Alt', 'key.AltRight': 'P Alt', 'key.Mouse0': 'Ľavé tl. myši', 'key.Mouse1': 'Koliesko (klik)', 'key.Mouse2': 'Pravé tl. myši',
    'key.Mouse3': 'Myš 4', 'key.Mouse4': 'Myš 5', 'key.WheelUp': 'Koliesko hore', 'key.WheelDown': 'Koliesko dole',
    'hud.health': 'Zdravie',
    'hud.breath': 'Dych',
    'hud.danger': 'KROKODÍL ŤA LOVÍ – SKÁČ!',
    'hud.poison': 'OTRAVA – SPOMAĽUJE ŤA',
    'hud.crocSpeed': 'rýchlosť krokodíla',
    'mode.dive': 'Potápanie', 'mode.swim': 'Plávanie', 'mode.glide': 'Let · {h} m', 'mode.air': 'Vo vzduchu',
    'mode.wade': 'Brodenie – skáč!', 'mode.land': 'Na súši',
    'combo.perfect': 'PERFEKTNÝ HOP ×{n}', 'combo.hop': 'HOP ×{n}',
    'toast.start': 'Si na pláži. More volá.',
    'toast.soundOff': 'Zvuk vypnutý', 'toast.soundOn': 'Zvuk zapnutý',
    'toast.pearl': 'Perla {n} / {t}',
    'toast.allFound': 'Máš všetky perly! Vráť sa na pláž.',
    'toast.crocAlert': 'Krokodíl si ťa všimol!',
    'toast.bite': 'Uhryzol ťa!',
    'toast.stingRay': 'Trnucha ťa bodla! Jed ťa spomalí.',
    'toast.stingLion': 'Pichol ťa perutýn! Jed ťa spomalí.',
    'toast.wake': 'Prebúdzaš sa… a znova zaspávaš. Perly ti ostali.',
    'hint.allFound': 'Máš všetky perly. Vráť sa na pláž!',
    'hint.poison': 'Jed ťa spomaľuje. Daj si pozor, kam stúpaš a čoho sa dotýkaš.',
    'hint.glide': 'Letíš tam, kam sa pozeráš: hore stúpaš (stojí to rýchlosť), dole strmhlav zrýchľuješ.',
    'hint.diveTouch': 'Pozri sa dole a plávaj dopredu = potápanie. ▼ potopiť, HOP vynoriť.',
    'hint.dive': '{f} + pohľad dole = potápanie · {d} potopiť · {j} vynoriť · {s} rýchlejšie',
    'hint.shallowTouch': 'Tu sa nedá plávať. Drž HOP a hýb sa – naberieš rýchlosť.',
    'hint.shallow': 'Tu sa nedá plávať. Drž {f} + {j} – bunnyhopom naberieš rýchlosť.',
    'hint.combo': 'Pusť a stlač skok tesne pred dopadom = perfektný hop. Pri rýchlosti drž skok a letíš.',
    'hint.rays': 'Pozor na trnuchy na dne – modré bodky v piesku.',
    'hint.pearls': 'Perly svietia modrým lúčom. Prvé sú v lagúne pred tebou.',
    'reveal.1': 'Prudko sa zobúdzaš.',
    'reveal.2': 'Srdce ti búši. Krokodíly v Červenom mori? Bol to len sen…',
    'reveal.3pearls': 'Zvláštne – perly máš stále pri sebe. Zatváraš oči… a si späť na pláži.',
    'reveal.3': 'Zatváraš oči… a si späť na pláži.',
    'end.twistTitle': 'Zobúdzaš sa',
    'end.twistText': 'Všetkých {n} perál leží na pláži a krokodíly zostali v mangrovoch… a vtom zazvoní budík. Krokodíly v Červenom mori? Lietanie? Bol to len sen.',
    'end.title': 'Sen sa splnil',
    'end.text': 'Všetkých {n} perál je na pláži. Krokodíly zostali v mangrovoch.',
    'end.again': 'Snívať ďalej',
    'end.restart': 'Nový sen',
    'stat.time': 'Čas', 'stat.speed': 'Najvyššia rýchlosť', 'stat.flight': 'Najdlhší let', 'stat.height': 'Najvyšší let',
    'stat.combo': 'Najdlhšia séria hopov', 'stat.perfect': 'Perfektné hopy', 'stat.stings': 'Bodnutia (trnucha, perutýn)', 'stat.wakes': 'Prebudenia',
    'sign.title': '⚠ POZOR ⚠', 'sign.l1': 'Za bójkami je plytčina,', 'sign.l2': 'mangrovy a', 'sign.l3': 'KROKODÍLY',
  },
  en: {
    'doc.title': 'DreamSpace – A Red Sea lagoon',
    'menu.sub': 'A lagoon on the Red Sea',
    'menu.story': 'A holiday on the Red Sea. In front of the resort’s beach lies a shallow turquoise lagoon. Further out the sea turns shallow again – mud, mangroves and narrow channels. The lifeguard says you’d better not go past the buoys.',
    'menu.paused': 'Paused. You keep the pearls you’ve found.',
    'menu.pausedDream': 'The dream will wait. You keep the pearls you’ve found.',
    'menu.goal': 'Find <b>{n} pearls</b> and bring them back to the beach.',
    'menu.controls': 'Controls',
    'menu.moves': 'Bunny hopping',
    'menu.tip1': 'Wading through the shallows is slow – <b>jump</b>.',
    'menu.tip2': 'Hold jump: you keep hopping on your own and pick up speed.',
    'menu.tip3': 'Let go and press again <b>just before you land</b>: a perfect hop, much more speed.',
    'menu.tip4': 'Watch out for <b>stingrays</b> on the bottom of the shallows and <b>lionfish</b> near the coral – they are venomous.',
    'menu.settings': 'Settings & keys',
    'menu.quality': 'Quality',
    'q.low': 'Low', 'q.medium': 'Medium', 'q.high': 'High',
    'menu.sens': 'Mouse sensitivity',
    'menu.fov': 'Field of view',
    'menu.invert': 'Invert Y axis',
    'menu.bindHelp': 'Click a slot, then press a key or mouse button, or turn the wheel. Backspace clears it, Esc cancels.',
    'menu.bindReset': 'Reset to defaults',
    'menu.lang': 'Language',
    'menu.play': 'Play',
    'menu.continue': 'Continue',
    'menu.loading': 'Loading…',
    'menu.ready': 'Click “Play” – the game captures the mouse. Esc releases it.',
    'menu.readyTouch': 'Touch: left thumb moves, right thumb looks, HOP jumps.',
    'keys.move': '{f} {l} {b} {r} move · <kbd>mouse</kbd> look',
    'keys.jump': '{k} jump / swim up',
    'keys.dive': '{k} dive',
    'keys.sprint': '{k} sprint / swim faster',
    'keys.mute': '{k} sound · <kbd>Esc</kbd> pause',
    'bind.wait': 'press…',
    'act.forward': 'Forward', 'act.back': 'Back', 'act.left': 'Left', 'act.right': 'Right',
    'act.jump': 'Jump / swim up', 'act.dive': 'Dive', 'act.sprint': 'Sprint / swim faster', 'act.mute': 'Sound',
    'key.Space': 'Space', 'key.ShiftLeft': 'L Shift', 'key.ShiftRight': 'R Shift', 'key.ControlLeft': 'L Ctrl', 'key.ControlRight': 'R Ctrl',
    'key.AltLeft': 'L Alt', 'key.AltRight': 'R Alt', 'key.Mouse0': 'Left mouse', 'key.Mouse1': 'Middle mouse', 'key.Mouse2': 'Right mouse',
    'key.Mouse3': 'Mouse 4', 'key.Mouse4': 'Mouse 5', 'key.WheelUp': 'Wheel up', 'key.WheelDown': 'Wheel down',
    'hud.health': 'Health',
    'hud.breath': 'Breath',
    'hud.danger': 'A CROCODILE IS HUNTING YOU – JUMP!',
    'hud.poison': 'VENOM – IT SLOWS YOU DOWN',
    'hud.crocSpeed': 'crocodile speed',
    'mode.dive': 'Diving', 'mode.swim': 'Swimming', 'mode.glide': 'Flying · {h} m', 'mode.air': 'Airborne',
    'mode.wade': 'Wading – jump!', 'mode.land': 'On land',
    'combo.perfect': 'PERFECT HOP ×{n}', 'combo.hop': 'HOP ×{n}',
    'toast.start': 'You’re on the beach. The sea is calling.',
    'toast.soundOff': 'Sound off', 'toast.soundOn': 'Sound on',
    'toast.pearl': 'Pearl {n} / {t}',
    'toast.allFound': 'You have all the pearls! Head back to the beach.',
    'toast.crocAlert': 'A crocodile has spotted you!',
    'toast.bite': 'It bit you!',
    'toast.stingRay': 'A stingray got you! The venom slows you down.',
    'toast.stingLion': 'A lionfish stung you! The venom slows you down.',
    'toast.wake': 'You wake up… and drift off again. You still have your pearls.',
    'hint.allFound': 'You have all the pearls. Back to the beach!',
    'hint.poison': 'The venom slows you down. Watch where you step and what you touch.',
    'hint.glide': 'You fly where you look: up climbs (costs speed), down dives and speeds up.',
    'hint.diveTouch': 'Look down and swim forward to dive. ▼ sinks, HOP surfaces.',
    'hint.dive': '{f} + look down = dive · {d} sink · {j} surface · {s} faster',
    'hint.shallowTouch': 'Too shallow to swim. Hold HOP and move – you’ll pick up speed.',
    'hint.shallow': 'Too shallow to swim. Hold {f} + {j} – bunny hopping builds speed.',
    'hint.combo': 'Let go and press jump just before landing = perfect hop. At speed, hold jump to fly.',
    'hint.rays': 'Watch out for stingrays on the bottom – blue spots in the sand.',
    'hint.pearls': 'Pearls glow with a blue beam. The first ones are in the lagoon ahead.',
    'reveal.1': 'You jolt awake.',
    'reveal.2': 'Your heart is pounding. Crocodiles in the Red Sea? It was only a dream…',
    'reveal.3pearls': 'Strangely, you still have the pearls. You close your eyes… and you’re back on the beach.',
    'reveal.3': 'You close your eyes… and you’re back on the beach.',
    'end.twistTitle': 'You wake up',
    'end.twistText': 'All {n} pearls are lying on the beach and the crocodiles stayed in the mangroves… and then the alarm clock rings. Crocodiles in the Red Sea? Flying? It was only a dream.',
    'end.title': 'The dream came true',
    'end.text': 'All {n} pearls are on the beach. The crocodiles stayed in the mangroves.',
    'end.again': 'Keep dreaming',
    'end.restart': 'New dream',
    'stat.time': 'Time', 'stat.speed': 'Top speed', 'stat.flight': 'Longest flight', 'stat.height': 'Highest flight',
    'stat.combo': 'Longest hop chain', 'stat.perfect': 'Perfect hops', 'stat.stings': 'Stings (stingray, lionfish)', 'stat.wakes': 'Wake-ups',
    'sign.title': '⚠ WARNING ⚠', 'sign.l1': 'Past the buoys: shallows,', 'sign.l2': 'mangroves and', 'sign.l3': 'CROCODILES',
  },
};

export const LANGS = Object.keys(STRINGS);
export { STRINGS };
const KEY = 'dreamspace.lang';
const browser = typeof document !== 'undefined';

function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
/** 'sk' if Slovak (or Czech) is anywhere in the browser's language list, otherwise 'en'. */
export function detect(list) {
  return list.some((l) => /^(sk|cs)\b/i.test(l || '')) ? 'sk' : 'en';
}
function initial() {
  if (!browser) return 'sk';
  const q = new URLSearchParams(location.search).get('lang');
  if (q && STRINGS[q]) return q;
  const s = stored();
  if (s && STRINGS[s]) return s;
  return detect((navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || '']);
}

let lang = initial();
const listeners = new Set();

export function getLang() { return lang; }

/** Translate `key`, filling {placeholders} from `vars`. */
export function t(key, vars) {
  let s = STRINGS[lang][key];
  if (s === undefined) s = STRINGS.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}
export function has(key) { return STRINGS[lang][key] !== undefined; }

export function apply(root = document) {
  document.documentElement.lang = lang;
  document.title = t('doc.title');
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml, el.dataset.vars ? JSON.parse(el.dataset.vars) : undefined);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-lang]')) el.setAttribute('aria-pressed', el.dataset.lang === lang ? 'true' : 'false');
}

export function setLang(l) {
  if (!STRINGS[l] || l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch (e) { /* private mode */ }
  if (browser) apply();
  for (const fn of listeners) fn(lang);
}
export function onLangChange(fn) { listeners.add(fn); }

// Runs as soon as the page has been parsed (before the 3D engine has loaded),
// so the menu never shows up in the wrong language.
if (browser) {
  apply();
  for (const el of document.querySelectorAll('[data-lang]')) el.addEventListener('click', () => setLang(el.dataset.lang));
  document.documentElement.classList.add('i18n');
}
