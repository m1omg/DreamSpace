# DreamSpace

3D webová hra: dovolenka v rezorte na brehu Červeného mora. Pred plážou je plytká tyrkysová lagúna,
ďalej od brehu bahno, mangrovy a úzke kanály.
*A 3D browser game: a holiday at a Red Sea resort – a shallow turquoise lagoon, and beyond it mud, mangroves and narrow channels.*

**Hrať / Play:** https://m1omg.github.io/DreamSpace/

Hra je po slovensky aj po anglicky. Jazyk sa vyberie podľa prehliadača (slovenčina, ak je slovenčina
alebo čeština v jeho zozname jazykov, inak angličtina) a dá sa prepnúť tlačidlami **SK / EN** v menu.
Voľba sa zapamätá. Odkaz s `?lang=sk` alebo `?lang=en` vynúti jazyk.

<details>
<summary>Spoiler – o čom hra naozaj je</summary>

Hra je podľa sna: plávaš v plytkej lagúne pri rezorte, ďalej od pláže sa more znova splytčuje a v mangrovoch
žijú morské krokodíly. Plávať sa tam nedá, ale bunnyhopuješ tak dobre, že na chvíľu letíš.

Na začiatku sa hra tvári ako obyčajná dovolenka – v menu ani v názve stránky nie je ani slovo o sne.
Pravda vyjde najavo, keď sa hráč prvýkrát „prebudí“ (uhryzne ho krokodíl, utopí sa…): obrazovka
stmavne, „Prudko sa zobúdzaš… Bol to len sen“ a až potom sa rozoznie snová hudba. Kto prejde celú hru
bez prebudenia, dozvie sa to na konci – zazvoní budík.
</details>

## Cieľ

Nájdi 15 perál (svietia modrým lúčom a sú na minimape) a vráť sa s nimi na pláž.

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

### Bunnyhop

- V plytčine sa brodíš pomaly, krokodíl je rýchlejší. Skáč.
- Drž skok: po dopade skočíš znova a postupne naberáš rýchlosť.
- Pusť ho a stlač tesne pred dopadom: perfektný hop bez straty rýchlosti a s väčším zrýchlením.
- Vo vzduchu funguje air strafe (do strán + otáčanie myšou).
- Každý hop v sérii skáče o kúsok vyššie. Nad cca 6,5 m/s drž skok vo vzduchu a letíš: už bežný
  držaný hop sa vznáša okolo 2 s. Letíš tam, kam sa pozeráš: pohľad hore stúpa (za cenu
  rýchlosti), pohľad dole za vrcholom oblúka je strmhlavý let, ktorý rýchlosť vráti. Let sa
  vždy skončí (pod 6,5 m/s vztlak zmizne). Vyletíš nad mangrovy a dá sa pristáť aj na streche.
  (V menu to nie je – hra to prezradí, až keď hráč začne skákať.)

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
- **Plynulosť:** prehliadače zaokrúhľujú časové značky snímok (Firefox na celé milisekundy), takže
  aj pri stabilných 60 Hz chodia časy 17, 17, 16… a pohyb sa trasie. `src/pacing.js` odhadne
  interval displeja (pri akejkoľvek frekvencii), zarovná naň časy snímok a chybu postupne dorovná,
  takže herný čas nikdy neujde od skutočného. Ak hra nestíha, rozlíšenie sa samo zníži.
- **Výkon:** stromy, budovy, koraly, morská tráva, raje aj krokodíly sa každú snímku orezávajú po
  jednotlivých kusoch podľa toho, čo je v zábere, a v diaľke sa kreslia jednoduchšie modely
  (`src/gfx/instancing.js`). Tieň slnka dostanú len objekty, ktoré ho môžu vrhnúť do okolia hráča.
  Všetky krokodíly sú jedno vykreslenie – čeľusť, nohy a chvost sa hýbu priamo v shaderi.
  Oproti predchádzajúcej verzii je to asi 4× menej trojuholníkov a 4× menej vykreslení na snímku.
- Voda: lom scény s pohlcovaním svetla podľa hĺbky, odraz oblohy (Fresnel), vlnky z dlaždicovej
  textúry v troch mierkach, trblietky slnka, pena pri skutočnom brehu, kaustiky, pohľad spod hladiny
  so Snellovým oknom, svetelné lúče pod vodou. Opar zosvetlie smerom k slnku a s výškou riedne.
- Mapa je obkreslená zo satelitnej snímky rezortu: rovná pláž s troma radmi slnečníkov, skutočný
  mangrovový porast na jej západnom konci, plytká lúka morskej trávy pred plážou, tri hlbšie lagúny
  v útesovej plošine, vonkajší okraj útesu vybiehajúci asi 400 m od brehu; terakotové dvojpodlažné
  bloky s oblúkovými lodžiami a kupolami, bazény voľného tvaru, okrúhla reštaurácia so slamenou strechou.

## Lokálne spustenie

```bash
npm start
```

Potom otvor `http://localhost:8080`.

```bash
npm test
```

## English

Find the 15 glowing pearls and bring them back to the beach. Wading is slow – bunny hop: hold jump to
keep hopping, or let go and press it again just before landing for a perfect hop. Watch out for stingrays
on the bottom and lionfish near the coral. All keys can be rebound in *Settings & keys*; the game is
playable in Slovak and English (detected from the browser, switchable with **SK / EN** in the menu,
or forced with `?lang=en` / `?lang=sk`).
