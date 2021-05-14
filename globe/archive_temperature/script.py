#import pandas as pd

import csv 
import json

# df = pd.read_csv(r'C:\wamp64\www\webgl-globe\globe\archive_temperature\GlobalLandTemperaturesByMajorCity.csv')
# df.to_json(r'./GlobalLandTemperatureByMajorCit.json')

def csv_to_json(csvFilePath, jsonFilePath):
    jsonArray = []
      
    #read csv file
    with open(csvFilePath, encoding='utf-8') as csvf: 
        #load csv file data using csv library's dictionary reader
        csvReader = csv.DictReader(csvf) 

        #convert each csv row into python dict
        for row in csvReader: 
            #add this python dict to json array
            jsonArray.append(row)

    # Remove unnecessary lines
    for element in jsonArray:
      element.pop('AverageTemperatureUncertainty', None)
      element.pop('City', None)
      element.pop('Country', None)

    # Convert N / S Latitude into + / -
    # Convert E / W Longitude into + / -
    kickout = 0
    for i in range(len(jsonArray)):
      if (i % 10000 == 0): print(i / (len(jsonArray) + kickout))

      if jsonArray[i - kickout]["dt"] != "2010-01-01":
        jsonArray.pop(i - kickout)
        kickout+=1
        continue

      if 'S' in jsonArray[i - kickout]["Latitude"]:
        jsonArray[i - kickout]["Latitude"] = "-" + jsonArray[i - kickout]["Latitude"]
      if 'W' in jsonArray[i - kickout]["Longitude"]:
        jsonArray[i - kickout]["Longitude"] = "-" + jsonArray[i - kickout]["Longitude"]
      # remove letter
      jsonArray[i - kickout]["Latitude"] = jsonArray[i - kickout]["Latitude"][:-1]
      jsonArray[i - kickout]["Longitude"] = jsonArray[i - kickout]["Longitude"][:-1]
      
    #convert python jsonArray to JSON String and write to file
    with open(jsonFilePath, 'w', encoding='utf-8') as jsonf: 
        jsonString = json.dumps(jsonArray, indent=4)
        jsonf.write(jsonString)


csvFilePath = r'C:\wamp64\www\webgl-globe\globe\archive_temperature\GlobalLandTemperaturesByCity.csv'
jsonFilePath = r'C:\wamp64\www\webgl-globe\globe\archive_temperature\GlobalLandTemperaturesByCity.json'

csv_to_json(csvFilePath, jsonFilePath)
