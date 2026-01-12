#!/bin/bash
# Quick script to check processing progress

PROJECT_ID="${1:-proj_7b9e839a0f1f4c79a4341740bf78acf7}"
DB_PATH="server/data/projects/${PROJECT_ID}.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file not found: $DB_PATH"
  exit 1
fi

echo "=== Processing Status ==="
sqlite3 "$DB_PATH" <<EOF
SELECT 
  'Total Signals: ' || total_signals as total,
  'Embeddings Complete: ' || embeddings_complete || ' / ' || total_signals as embeddings,
  'Similarities Complete: ' || embedding_similarities_complete || ' / ' || total_signals as similarities,
  'Claude Verifications: ' || claude_verifications_complete || ' / ' || total_signals as claude,
  'Status: ' || status as status,
  'Started: ' || COALESCE(started_at, 'Not started') as started,
  'Error: ' || COALESCE(error_message, 'None') as error
FROM processing_status 
WHERE project_id = '${PROJECT_ID}';
EOF

echo ""
echo "=== Database Counts ==="
sqlite3 "$DB_PATH" <<EOF
SELECT 
  'Signals with embeddings: ' || COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) || ' / ' || COUNT(*) as embeddings_in_db
FROM signals;
EOF


