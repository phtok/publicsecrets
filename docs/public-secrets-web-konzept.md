# Konzept: Public Secrets – Die Frage

## 1. Zielbild
Die Website „Public Secrets – Die Frage“ ist ein redaktionell gepflegtes, interaktives Frage-Archiv für das Gesprächsformat **„Wahrnehmungsorgan“** des Public Secrets Ensembles.

Sie verbindet:
- **Präsentation** einzelner Fragen im Fokus,
- **Interaktion** (Sternebewertung + Kommentare),
- **Kuratierung** (Ansichten: beliebteste, chronologisch, Interaktionen, Autor:innen),
- **Kontext** (Ensemble, Veranstaltungen, Initiativen).

## 2. Kern-User-Journey (Startseite)
1. Beim Aufruf erscheint **eine Frage groß** und typografisch reduziert.
2. Beim Anklicken der Frage öffnet sich die Interaktion:
   - Sternebewertung **1–5**,
   - Kommentar-Eingabe.
3. Nach dem Senden der Bewertung erscheint automatisch die **nächste Frage**.
4. Optional kann zur nächsten Frage gesprungen werden („Überspringen“), damit der Flow niedrigschwellig bleibt.

## 3. Informationsarchitektur

### Hauptnavigation (Hamburger-Menü)
- **Die Frage** (Start / Interaktionsmodus)
- **Fragesammlung**
  - Beliebteste
  - Chronologisch
  - Interaktionen (meist kommentiert / meist bewertet)
  - Nach Autor:innen
- **Ensemble** (Mitglieder + Porträts)
- **Veranstaltungen**
  - Kommende Termine
  - Archiv
- **Initiativen**
  - Aktive Initiativen
  - Archiv / anknüpfbare Kontakte
- **Über / Impressum / Datenschutz**

## 4. Inhaltstypen und Datenmodell (CMS-fähig)

### Frage
- ID
- Fragetext
- Kurzbeschreibung/Kontext (optional)
- Autor:in(nen) (0..n; inkl. „Anonym“)
- Schlagworte (optional)
- Status (entwurf/veröffentlicht/archiviert)
- Veröffentlichungsdatum
- Bildbezug (optional)
- Metriken (aggregiert):
  - Anzahl Bewertungen
  - Durchschnittsrating
  - Anzahl Kommentare

### Kommentar
- ID
- Frage-ID
- Name oder Pseudonym (optional)
- Text
- Moderationsstatus (sichtbar, ausstehend, verborgen)
- Zeitstempel

### Bewertung
- ID
- Frage-ID
- Sterne 1–5
- Zeitstempel
- Technische Anti-Missbrauch-Felder (z. B. Hash/Fingerprint, ohne personenbezogene Speicherung)

### Autor:in
- ID
- Name
- Profiltext
- Portraitfoto
- Rolle im Ensemble (optional)

### Veranstaltung
- ID
- Titel
- Beschreibung
- Datum/Zeit
- Ort
- Link/Ticket (optional)
- Status (kommend/archiv)
- Bild (optional)

### Initiative
- ID
- Titel
- Kurzbeschreibung
- Detailtext
- Kontakt/Call-to-Action
- Status (aktiv/archiv)
- Bild (optional)

## 5. Redaktions- und Rollenmodell

### Rollen
- **Admin**: Struktur, Rechte, Moderation, Veröffentlichung
- **Redakteur:in**: Fragen + Termine pflegen, Inhalte aktualisieren
- **Autor:in** (optional): Fragen einreichen (Freigabe durch Redaktion)

### Workflow
- Fragen und Termine werden **mindestens wöchentlich** eingetragen.
- Initiativen werden **unregelmäßig** gepflegt.
- Kommentare laufen optional über Moderation (Pre- oder Post-Moderation).

## 6. Backend-Anforderungen (schlicht, robust)

### Muss-Anforderungen
- Login für mehrere Redakteur:innen
- CRUD für Fragen, Veranstaltungen, Initiativen, Autor:innen
- Moderation für Kommentare
- Einfache Auswertungen:
  - Top-Fragen nach Durchschnittsrating
  - Aktivitätsranking nach Interaktionen
- CSV-Export (optional) für Archiv/Reporting

### Technischer Minimalvorschlag
- **Headless CMS** (z. B. Directus, Strapi oder Payload) ODER schlankes Custom-Backend
- Datenbank: PostgreSQL oder SQLite (je nach Hosting)
- Frontend als statische Website + API-Anbindung
- Auth mit rollenbasierter Zugriffskontrolle

## 7. Frontend-Ansichten im Detail

### A) Start „Die Frage“
- Vollflächige ruhige Fläche, Fokus auf eine Frage
- Große Typografie
- Klick auf Frage öffnet Bewertungs- und Kommentar-Layer
- Progress-Hinweis (z. B. „Frage 3 von 12“)

### B) Fragesammlung
- Karten- oder Listenansicht
- Sortier-/Filterfunktionen:
  - Beliebtheit
  - Neueste / älteste
  - Meiste Interaktionen
  - Autor:in
- Suche über Volltext (optional)

### C) Ensemble
- Grid aus Portraitfotos
- Kurztexte zu Rollen/Interessen
- Verlinkung zu von ihnen verfassten Fragen

### D) Veranstaltungen
- Kommende Termine prominent
- Archiv mit Monats-/Jahresfilter
- Einzelseiten mit Bild + Rückblickmaterial

### E) Initiativen
- Projektkarten mit „Mitmachen“-CTA
- Optional Kontaktformular oder externe Links

## 8. Designsystem (gemäß Vorgabe)
- **Grundfarbe:** Weiß
- **Akzentfarben:** Grau und Petrol
- **Schwerpunkt:** Typografie, ruhige Flächen, klare Hierarchie
- **Bildsprache:** Portraitfotos, Projektbilder
- **Archivbereich:** Fotoalbum-Ansicht mit leichtem Grid
- **Barrierearm:** hoher Kontrast, tastaturbedienbare Interaktionen, lesbare Schriftgrößen

## 9. Interaktions- und Moderationsregeln
- Eine Bewertung pro Person/Session pro Frage (soft begrenzt)
- Kommentare mit Netiquette-Hinweis
- Missbrauchsschutz:
  - Rate-Limit
  - einfache Spam-Checks
  - Moderationsqueue

## 10. MVP-Umfang (Phase 1)
1. Startseite mit Frage-Flow (Bewertung + Kommentar + nächste Frage)
2. Fragesammlung mit 4 Sortieransichten
3. Ensemble-Unterseite
4. Veranstaltungen (kommend + archiv)
5. Initiativen-Landing
6. Redaktionsbackend mit Rollen + Moderation

## 11. Erweiterungen (Phase 2)
- Personalisierte Fragevorschläge
- Themen-Tags und kuratierte Dossiers
- Mehrsprachigkeit
- Newsletter-Anbindung
- Statistische Jahresrückblicke

## 12. Empfohlene nächste Schritte
1. 60–90 Minuten Workshop mit Ensemble zur Priorisierung von MVP-Funktionen.
2. Entscheidung „Headless CMS vs. Custom Backend“.
3. Erstellung eines klickbaren Wireframes (Startflow + Fragesammlung + Backend-Maske).
4. Inhaltliche Ersterfassung:
   - 30–50 Fragen,
   - 8–12 Autor:innen,
   - 10 Veranstaltungen,
   - 3–5 Initiativen.
5. Technischer Sprint für MVP (2–4 Wochen).
