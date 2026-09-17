import os
import shutil

os.makedirs('static', exist_ok=True)

# 1. Copy style.css
shutil.copy('scratch/live_style.css', 'static/style.css')
print('Copied static/style.css')

# 2. Copy map.js
shutil.copy('scratch/live_map.js', 'static/map.js')
print('Copied static/map.js')

# 3. Copy vector layers from js/data/
shutil.copy('js/data/watersupply.js', 'static/watersupply.js')
shutil.copy('js/data/powerGridTracks.js', 'static/powerGridTracks.js')
shutil.copy('js/data/coastalRegulationZone.js', 'static/coastalRegulationZone.js')
shutil.copy('js/data/drone_survey.geojson', 'static/drone_survey_79Q547SNA8EHU9.geojson')
shutil.copy('js/data/drone_survey.geojson', 'static/drone_survey.geojson')
shutil.copy('js/data/vizag_railway_station.geojson', 'static/vizag_railway_station.geojson')
print('Copied static vector data layers')

print('\nAll static files in static/:')
for f in os.listdir('static'):
    sz = os.path.getsize(os.path.join('static', f))
    print(f' - {f} ({sz} bytes)')
