
import ee

PROJECT_ID = "field-shift-nasa"

try:
    ee.Initialize(project=PROJECT_ID)

    print("Google Earth Engine connected successfully!")

    collection = ee.ImageCollection(
        "NASA/SMAP/SPL4SMGP/008"
    )

    image = collection.first()
    info = image.getInfo()

    print("\nNASA SMAP dataset accessible!")
    print("Image ID:", info.get("id"))

    print("\nAvailable bands:")

    for band in info["bands"]:
        print("-", band["id"])

except Exception as error:
    print("\nConnection or dataset test failed:")
    print(error)
