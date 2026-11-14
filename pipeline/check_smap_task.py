
import ee
import json
from pathlib import Path

PROJECT_ID = "field-shift-nasa"

ee.Initialize(project=PROJECT_ID)

project_dir = Path(__file__).resolve().parent.parent

metadata_path = (
    project_dir / "data" / "raw" / "F01" / "smap_metadata.json"
)

if not metadata_path.exists():
    print("SMAP metadata file not found.")
    raise SystemExit(1)

with metadata_path.open("r", encoding="utf-8") as file:
    metadata = json.load(file)

saved_task_id = metadata.get("task_id")

print("\n========== SMAP EXPORT STATUS ==========")
print("Saved task ID:", saved_task_id)

tasks = ee.batch.Task.list()

found = False

for task in tasks:
    status = task.status()

    if status.get("id") == saved_task_id:
        found = True

        print("\nTask description:", status.get("description"))
        print("Task state:", status.get("state"))
        print("Task details:", status)

        break

if not found:
    print("\nSaved task was not found in the current task list.")
    print("\nRecent Earth Engine tasks:")

    for task in tasks[:10]:
        print(task.status())

print("\n========== CHECK COMPLETED ==========")
