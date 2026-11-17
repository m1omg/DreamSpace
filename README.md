# DreamSpace – Sen o lagúne

3D webová hra podľa sna: plávaš v plytkej lagúne pri rezorte na brehu Červeného mora.
Ďalej od pláže sa more znova splytčuje – bahno, mangrovy a v nich morské krokodíly.
Plávať sa tam nedá, ale v tomto sne vieš bunnyhopovať tak dobre, že na chvíľu letíš.

**Hrať:** https://m1omg.github.io/DreamSpace/

## Cieľ

Nájdi 15 snových perál (svietia modrým lúčom a sú na minimape) a vráť sa s nimi na pláž.

## Ovládanie

Všetky klávesy a tlačidlá myši sa dajú zmeniť v menu (Nastavenia a klávesy). Predvolené:

| Vstup | Akcia |
| --- | --- |
| `W` `A` `S` `D` / šípky | pohyb |
| myš | rozhľad |
| `Medzerník` / pravé tlačidlo myši | skok, vo vode nahor |
| `C` / `Ctrl` | potopiť sa |
| `Shift` | šprint / rýchle plávanie |
| `M` | zvuk |
| `Esc` | pauza |

Na skok sa dá naviazať aj koliesko myši. Na dotykových zariadeniach: ľavý palec pohyb, pravý rozhľad, tlačidlá HOP a ▼.

### Bunnyhop a let

- V plytčine sa brodíš pomaly, krokodíl je rýchlejší. Skáč.
- Drž skok: po dopade skočíš znova a postupne naberáš rýchlosť.
- Pusť ho a stlač tesne pred dopadom: perfektný hop bez straty rýchlosti a s väčším zrýchlením.
- Vo vzduchu funguje air strafe (do strán + otáčanie myšou).
- Nad cca 8 m/s drž skok vo vzduchu a plachtíš. Pohľad hore ťa zdvihne (za cenu rýchlosti),
  pohľad dole rýchlosť vráti. Vyletíš nad mangrovy a dá sa pristáť aj na streche.

### Nebezpečenstvá

- **Krokodíly** v mangrovoch, kanáloch a pri okrajoch hlbokých lagún. Zbadajú ťa skôr, keď špliechaš.
- **Trnuchy** (raje s modrými bodkami) ležia na dne tam, kde sa brodí. Stúpiš na ňu, bodne.
- **Perutýny** (levie ryby) sa vznášajú pri koraloch a pomaly sa k plavcovi približujú.
- Bodnutie uberie zdravie a jed ťa na pár sekúnd spomalí.

## Technika

- Čistý statický web: [three.js](https://threejs.org) je pribalený vo `vendor/`, žiadny build krok.
- **Nezávislosť od snímkovej frekvencie:** fyzika, AI a časovače bežia v pevnom kroku 1/120 s
  (`src/sim/game.js`), obraz sa interpoluje medzi dvoma poslednými krokmi. Rozhľad myšou sa mení
  podľa udalostí vstupu, nie podľa snímok. `npm test` prehrá rovnaký vstup pri 24–360 Hz a overí,
  že výsledok je bit po bite rovnaký.
- Voda: lom scény s pohlcovaním svetla podľa hĺbky, odraz oblohy (Fresnel), pena pri brehu,
  kaustiky, pohľad spod hladiny so Snellovým oknom, svetelné lúče pod vodou.
- Mapa je obkreslená zo satelitnej snímky rezortu: rovná pláž s troma radmi slnečníkov, skutočný
  mangrovový porast na jej západnom konci, plytká lúka morskej trávy pred plážou, tri hlbšie lagúny
  v útesovej plošine (malá západná, veľká stredná s tmavomodrým stredom, východná „Lagoon reef“),
  vonkajší okraj útesu vybiehajúci asi 400 m od brehu; terakotové dvojpodlažné bloky s oblúkovými
  lodžiami a kupolami, bazény voľného tvaru, okrúhla reštaurácia so slamenou strechou.
  Zo sna je to, že útesová plošina je mangrovová plytčina s krokodílmi.

## Lokálne spustenie

```bash
npm start
```

Potom otvor `http://localhost:8080`.

```bash
npm test
```
