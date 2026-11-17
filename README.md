# DreamSpace – Sen o lagúne

3D webová hra podľa sna: plávaš v plytkej lagúne pri rezorte na brehu Červeného mora.
Ďalej od pláže sa more znova splytčuje – bahno, mangrovy a v nich morské krokodíly.
Plávať sa tam nedá, ale v tomto sne vieš bunnyhopovať tak dobre, že na chvíľu letíš.

**Hrať:** https://m1omg.github.io/DreamSpace/

## Cieľ

Nájdi 12 snových perál (svietia modrým lúčom a sú na minimape) a vráť sa s nimi na pláž.

## Ovládanie

| Vstup | Akcia |
| --- | --- |
| `W` `A` `S` `D` / šípky | pohyb |
| myš | rozhľad |
| `Medzerník` | skok, vo vode nahor |
| `C` / `Ctrl` / `Q` | potopiť sa |
| `Shift` | šprint / rýchle plávanie |
| `M` | zvuk |
| `Esc` | pauza |

Na dotykových zariadeniach: ľavý palec pohyb, pravý rozhľad, tlačidlá HOP a ▼.

### Bunnyhop

- V plytčine sa brodíš pomaly, krokodíl je rýchlejší. Skáč.
- Drž medzerník: po dopade skočíš znova a postupne naberáš rýchlosť.
- Pusť ho a stlač tesne pred dopadom: perfektný hop bez straty rýchlosti a s väčším zrýchlením.
- Vo vzduchu funguje air strafe (`A`/`D` + otáčanie myšou).
- Nad cca 7,5 m/s drž medzerník vo vzduchu a plachtíš – tak preletíš aj hlboké kanály.

## Technika

- Čistý statický web: [three.js](https://threejs.org) je pribalený vo `vendor/`, žiadny build krok.
- **Nezávislosť od snímkovej frekvencie:** fyzika, AI a časovače bežia v pevnom kroku 1/120 s
  (`src/sim/game.js`), obraz sa interpoluje medzi dvoma poslednými krokmi. Rozhľad myšou sa mení
  podľa udalostí vstupu, nie podľa snímok. `npm test` prehrá rovnaký vstup pri 24–360 Hz a overí,
  že výsledok je bit po bite rovnaký.
- Voda: lom scény s pohlcovaním svetla podľa hĺbky, odraz oblohy (Fresnel), pena pri brehu,
  kaustiky, pohľad spod hladiny so Snellovým oknom, svetelné lúče pod vodou.
- Mapa: rozloženie rezortu vychádza z verejných popisov (asi 500 m pieskovej pláže, veľká plytká
  lagúna chránená vonkajším útesom, tri bazény a detský bazén, plážové bary, nízke bloky izieb
  s kupolami). Presné pôdorysy budov sú odhad, mangrovy a krokodíly sú zo sna.

## Lokálne spustenie

```bash
npm start
```

Potom otvor `http://localhost:8080`.

```bash
npm test
```
