# Public Secrets Entscheidungsprotokoll

Stand: 2026-03-11

Dieses Dokument haelt die bislang verbindlich getroffenen Produkt- und Betriebsentscheidungen fuer die weitere Entwicklung fest.

## 1. Produktfokus
- `Public Secrets` ist zunaechst vor allem eine Frage-Plattform.
- Das Ensemble dient der Einbettung und Darstellung, ist aber nicht der primaere Kern der ersten Produktphase.
- Profile fuer Nichtmitglieder sind ein spaeterer Ausbauschritt.

## 2. Rollenmodell
- Redaktion und Mitglieder arbeiten parallel im System.
- Mitglieder duerfen ihre eigenen Inhalte selbst pflegen.
- Mitglieder duerfen bearbeiten:
  - eigenes Profil
  - eigene Fragen
  - eigene Termine
  - eigene Initiativen

## 3. Publikationslogik
- Inhalte sind standardmaessig sofort live.
- Fuer alle Inhaltstypen ist `Archivieren` wichtiger als `Loeschen`.
- Archiv gilt perspektivisch fuer alle Inhalte.

## 4. Archiv und Loeschen
- Archivierte Inhalte sollen fuer die Redaktion sichtbar sein.
- Archivierte Inhalte sollen nach Typ filterbar sein.
- Archivierte Inhalte sollen wiederhergestellt werden koennen.
- Loeschen bleibt moeglich:
  - fuer Admins
  - fuer Mitglieder bei eigenen Inhalten
- Admins sollen zusaetzlich sehen koennen, was geloescht wurde.
- Daraus folgt perspektivisch ein Loeschprotokoll oder Papierkorb fuer Admins.

## 5. Login und Identitaet
- Mitglieder-Login bleibt vorerst zweigleisig:
  - Magic Link
  - Passwort
- Magic Links sind die bevorzugte Richtung.
- Passwort-Login kann spaeter entfallen.
- Logins sollen auf demselben Geraet moeglichst dauerhaft bestehen bleiben, bis aktiv ausgeloggt wird oder das Geraet wechselt.

## 6. Kommentare und Antworten
- Kommentare und Antworten sind standardmaessig sofort sichtbar.
- Moderation erfolgt nur bei Bedarf durch nachtraegliches Ausblenden.
- Fuer Ernstfaelle soll das Kommentieren und Antworten fuer Nichtmitglieder global abschaltbar sein.

## 7. Personenmodelle
- Ensemble-Mitglieder:
  - Klick auf den Namen fuehrt zu einem vollen Profil
  - sichtbar sein sollen Vita, Kalender, Initiativen sowie Fragen und Antworten
- Externe Autor:innen ohne Ensemble-Mitgliedschaft:
  - zunaechst nur als Autor:innen sammeln
  - Namen sollen unter Fragen und Antworten anklickbar sein
  - die einfache Personenansicht zeigt vorerst nur Fragen und Antworten
  - keine Profilbilder, Termine oder Initiativen in dieser ersten Ausbaustufe
- Langfristig:
  - auch Nichtmitglieder sollen vollwertige Profile mit Login bekommen koennen
  - sie muessen dabei als Nichtmitglieder unterscheidbar bleiben

## 8. Datenarchitektur
- Die JSON-Loesung ist nur eine Zwischenstufe.
- Die Anwendung soll aktiv auf eine Datenbank umgestellt werden.
- Reihenfolge:
  1. automatisierte Backups
  2. Admin-Export/Import
  3. Datenbank-Migration

## 9. Betriebsprioritaeten
- Prioritaeten fuer den naechsten Betriebsaufbau:
  1. automatisierte Backups
  2. Admin-Export/Import
  3. Staging-Umgebung
  4. Monitoring und Tests

## 10. Admin-Export/Import
- Erste Ausbaustufe ist bewusst einfach.
- Mindestumfang:
  - kompletter Gesamt-Export
  - kompletter Gesamt-Import

## 11. Ableitungen fuer die naechsten Entwicklungsphasen
- Kurzfristig wichtig:
  - Frage-Plattform schaerfen
  - Archiv- statt Loesch-Logik einfuehren
  - Personenansichten fuer Ensemble-Mitglieder und externe Autor:innen klar trennen
  - lange persistente Mitglieds-Logins unterstuetzen
- Danach wichtig:
  - automatisierte Backups
  - Admin-Export/Import
  - Datenbank-Migration
