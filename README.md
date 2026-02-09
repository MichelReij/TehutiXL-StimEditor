# Tehuti StimEditor

Een visuele tool voor het categoriseren en annoteren van emotionele stimuli voor wetenschappelijk onderzoek. Deze applicatie biedt een interface om afbeeldingen te taggen met emotionele en neurologische metadata, inclusief excitatie-patronen over meerdere lagen.

## 📋 Functies

- **Auto-Discovery Stimuli**: Automatische detectie van alle afbeeldingen in `/source/assets/stimuli`
  - Scant folder bij elke start van de applicatie
  - Voegt nieuwe bestanden automatisch toe
  - Verwijdert niet-bestaande bestanden uit de lijst
  - Behoudt alfabetische volgorde van bestandsnamen
  - Bewaart bestaande tag-toewijzingen
- **Stimulus Management**: Beheer en categoriseer emotionele afbeeldingen
- **Tag Systeem**: Maak tags aan met naam, adrenaline-niveau en 24-laags excitatie data
- **Visuele Editor**: Bewerk excitatie-punten met real-time heatmap visualisatie
- **Data Export**: Genereer C-style arrays voor embedded systemen (ESP32, microcontrollers)
- **Backup/Restore**: Exporteer en importeer volledige datasets als JSON
- **LocalStorage**: Automatische opslag van alle wijzigingen

## 🚀 Installatie

### Vereisten

- Node.js 18+
- npm of yarn

### Setup

```bash
# Installeer dependencies
npm install

# Start ontwikkel server
npm run dev

# Build voor productie
npm run build

# Preview productie build
npm run preview
```

## 📖 Gebruik

### Tags Aanmaken

1. Klik op **"Add Tag"** in het linker paneel
2. Vul de tag eigenschappen in:
   - **ID**: Automatisch toegewezen uniek nummer
   - **Name**: Beschrijvende naam (bijv. "joy", "fear", "surprise")
   - **Adrenaline**: Waarde tussen 0-1 (stap 0.05)

### Excitatie Data Bewerken

1. Selecteer een tag uit de lijst
2. Scroll naar beneden naar de layer editors
3. Voer JSON data in voor elke layer:

```json
[
  {"x": 0, "y": 0, "intensity": 8, "size": 3},
  {"x": 5, "y": 3, "intensity": 6, "size": 5}
]
```

**Parameters:**
- `x`, `y`: Coördinaten (-20 tot +20)
- `intensity`: Intensiteit (0-8, 9-punts schaal)
- `size`: Grootte van de excitatie zone (1-20)

### Stimuli Toewijzen

1. Selecteer een tag
2. Vink de checkboxen aan bij relevante afbeeldingen
3. Wijzigingen worden automatisch opgeslagen

### Stimuli Beheren

**Foto's voorbereiden:**

Voordat je foto's toevoegt aan de applicatie:
1. Exporteer foto's uit Lightroom (1024x1024px, JPEG)
2. Verwerk alle geëxporteerde foto's met **ImageOptim** app
   - Sleep de foto's in ImageOptim voor optimale compressie
   - Dit verkleint de bestandsgrootte zonder kwaliteitsverlies
3. Plaats de geoptimaliseerde foto's in `source/assets/stimuli/`

**Automatisch:**
De applicatie detecteert automatisch alle `.jpg` bestanden in `/source/assets/stimuli/`:
- Bij elke start worden nieuwe bestanden toegevoegd
- Bestanden blijven alfabetisch gesorteerd
- Bestaande tag-toewijzingen blijven behouden
- Verwijderde bestanden worden uit de lijst gehaald

**Handmatig toevoegen via C-array:**

1. Klik op **"Add stimuli"**
2. Plak C-style array data in het tekstveld:

```c
{
  112,
  animal_cat_eyes,
  sizeof(animal_cat_eyes),
  {1, 3, 7}
}
```

3. De applicatie parseert en voegt de stimuli toe

### Data Exporteren

**Voor C/C++ projecten:**
- **"C-array tags"**: Exporteert tags als C struct array
- **"C-array stimuli"**: Exporteert stimuli als C struct array

**Voor Backup:**
- **"Export JSON"**: Download volledige dataset
- **"Import JSON"**: Laad eerder opgeslagen dataset

## 🏗️ Project Structuur

```
StimEditor/
├── source/              # Broncode
│   ├── index.html      # Hoofd HTML bestand
│   ├── css/
│   │   └── main.scss   # Styling (SCSS)
│   ├── js/
│   │   ├── main.ts     # Hoofdapplicatie (TypeScript)
│   │   ├── images.json # Stimulus definities
│   │   └── hsluv.js    # Kleur conversie library
│   └── img/
│       ├── stimuli/    # Emotionele afbeeldingen (~200)
│       ├── masks/      # Overlay maskers
│       └── mri/        # MRI referentie beelden
├── dist/               # Productie build output
├── package.json
├── vite.config.ts     # Vite configuratie
└── tsconfig.json      # TypeScript configuratie
```

## 🛠️ Technische Details

### Tech Stack

- **Frontend**: TypeScript, HTML5, SCSS
- **Styling**: Tailwind CSS + Custom SCSS
- **Build Tool**: Vite
- **Color Library**: HSLuv voor kleur manipulatie
- **Storage**: Browser localStorage

### Data Structuren

**Tag Interface:**
```typescript
interface Tag {
  id: number;
  name: string;
  adrenaline: number;
  layers: Layer[];
}
```

**Excitation Point:**
```typescript
interface ExcitationData {
  x: number;
  y: number;
  intensity: number;
  size: number;
}
```

**Stimulus:**
```typescript
interface Stimulus {
  id: number;
  file: string;
  size: string;
  tags: number[];
}
```

## 💾 Data Persistentie

Alle data wordt automatisch opgeslagen in browser localStorage:
- **Key `tags`**: Array van alle tags met layer data
- **Key `stimuli`**: Array van alle stimuli met tag assignments

**⚠️ Belangrijk**: Wis nooit browser data zonder eerst een backup te maken!

## 🎨 Heatmap Visualisatie

Excitatie-punten worden gevisualiseerd met een 64-stappen heatmap:
- **Rood (#FF0000)**: Maximale intensiteit (63)
- **Oranje/Geel**: Middelmatige intensiteit
- **Geel (#FFFF00)**: Lage intensiteit (0)

## 🔧 Ontwikkeling

### Development Server

```bash
npm run dev
```

Opent op `http://localhost:5173`

### Type Checking

```bash
npm run type-check
```

### Build voor Productie

```bash
npm run build
```

Output in `dist/` folder

## 📝 Tips & Best Practices

1. **Regelmatig Backup**: Exporteer JSON regelmatig als veiligheid
2. **Tag Naming**: Gebruik consistente naamgeving (lowercase, underscore separators)
3. **Layer Organisation**: Layer 17 wordt gebruikt voor C-export
4. **Intensity Range**: Houd intensiteit tussen 0-8 (9-punts schaal) voor correcte visualisatie
5. **Browser Compatibility**: Gebruik moderne browsers (Chrome, Firefox, Safari, Edge)

## 🐛 Troubleshooting

**Tags worden niet opgeslagen:**
- Check of localStorage enabled is in browser settings
- Controleer browser console voor errors

**Afbeeldingen laden niet:**
- Verifieer dat afbeeldingen in `source/assets/stimuli/` staan
- Check of bestandsnamen .jpg extensie hebben

**JSON parsing errors:**
- Valideer JSON syntax (gebruik jsonlint.com)
- Controleer of alle haakjes en komma's correct zijn

## 📄 Licentie

Private project - Alle rechten voorbehouden

## 👤 Contact

Voor vragen of ondersteuning, neem contact op met de projectbeheerder.

---

**Versie**: 2.0.0
**Laatst bijgewerkt**: Januari 2026
