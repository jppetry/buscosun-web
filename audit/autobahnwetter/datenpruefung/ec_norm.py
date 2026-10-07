"""eccodes decode of every SWIS bulletin given -> normalised station records (independent of buscosun's decoder)."""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ec_dump import subsets

K = 273.15
def rec(seq, group):
    r = {'group': group, 'sensors': [], 'heights': []}
    sen = None
    tp = 0
    last_h = None
    for name, v in seq:
        if name in ('shortStationName',):
            r['id'] = v
        elif name == 'stationOrSiteName':
            r['name'] = v
        elif name == 'highwayDesignator':
            r['hw'] = v
        elif name in ('latitude', 'longitude'):
            r.setdefault(name, v)
        elif name in ('year', 'month', 'day', 'hour', 'minute'):
            r.setdefault(name, v)
        elif name == 'heightOfStationGroundAboveMeanSeaLevel':
            r['elev'] = v
        elif name == 'heightOfSensorAboveLocalGroundOrDeckOfMarinePlatform':
            last_h = v
            r['heights'].append(v)
        elif name == 'airTemperature':
            r['ta'] = None if v is None else round(v - K, 2); r['taH'] = last_h
        elif name == 'dewpointTemperature':
            r['td'] = None if v is None else round(v - K, 2)
        elif name == 'relativeHumidity':
            r['rh'] = v
        elif name == 'horizontalVisibility':
            r['vis'] = v; r['visH'] = last_h
        elif name == 'positionOfRoadSensors':
            sen = {'pos': v}; r['sensors'].append(sen)
        elif name == 'roadSurfaceTemperature' and sen is not None:
            sen['rs'] = None if v is None else round(v - K, 2)
        elif name == 'waterFilmThickness' and sen is not None:
            sen['wf'] = None if v is None else round(v * 1000, 1)
        elif name == 'roadSurfaceCondition' and sen is not None:
            sen['cond'] = v
        elif name == 'timePeriod':
            r.setdefault('periods', []).append(v)
        elif name == 'intensityOfPhenomena':
            r['intens'] = v
        elif name == 'intensityOfPrecipitation':
            r['pr'] = None if v is None else round(v * 3600, 2)
        elif name == 'precipitationType':
            r['pt'] = v
        elif name == 'totalPrecipitationOrTotalWaterEquivalent':
            r['pa'] = v
        elif name == 'windDirection':
            r['wd'] = v; r['wH'] = last_h
        elif name == 'windSpeed':
            r['ws'] = v
        elif name == 'maximumWindGustSpeed':
            r['wg'] = v
        elif name == 'qualityInformationAwsData':
            r['q'] = v
    return r

out = []
for p in sys.argv[1:]:
    g = os.path.basename(p)[:-4]
    for s in subsets(p):
        out.append(rec(s, g))
json.dump(out, sys.stdout, default=str)
