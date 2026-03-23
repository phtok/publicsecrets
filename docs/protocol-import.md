# Protokoll-Import fuer Fragen

Der Importer liest rohe Protokolltexte, versucht Autor, Datum und Ort sauber zu erkennen und stoppt bei Ambiguitaeten, statt stillschweigend falsche Daten zu schreiben.

## Aufruf

```bash
cd /Users/philipptok/publicsecrets
./bin/node scripts/import_protocol_questions.js /pfad/zum/protokoll.txt
```

Schreibt erst nach expliziter Freigabe:

```bash
./bin/node scripts/import_protocol_questions.js --apply /pfad/zum/protokoll.txt
```

## Verhalten

- parst Datumszeilen wie `24. Oktober 2025, Salon der guten Gespraeche`
- gleicht Autoren gegen `data/people.json` ab
- erkennt einige Alias-Schreibweisen wie `Juli` -> `Juliane von Crailsheim` und `Philip` -> `Philipp Tok`
- akzeptiert auch externe Autor:innen mit ausgeschriebenem Namen
- erlaubt bewusst markierte offene Faelle ueber `Ungeklaert` oder `Ungeklaert (Namehinweis)`
- normalisiert bekannte Ortsvarianten wie `Slon der guten Gespraeche`
- schreibt Fragen idempotent nach `data/questions.json`
- blockiert den Import bei fehlendem Ort, fehlendem/unaufgeloestem Autor oder anderen Auffaelligkeiten

## Hinweis

Aktuell wird bei importierten Fragen zusaetzlich `sourceLabel` gespeichert, damit die Herkunft aus dem jeweiligen Protokoll spaeter nachvollziehbar bleibt.
