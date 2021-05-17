#import pandas as pd

import csv 
import json

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
    jsonResult = []
    compteur = 0
    for element in jsonArray:
        compteur+=1
        if (compteur % 10000 == 0): print((compteur*100) / len(jsonArray))

        if element["dt"] != "2010-01-01":
            continue

        element.pop('AverageTemperatureUncertainty', None)
        element.pop('City', None)
        element.pop('Country', None)      

        if 'S' in element["Latitude"]:
            element["Latitude"] = "-" + element["Latitude"]
        if 'W' in element["Longitude"]:
            element["Longitude"] = "-" + element["Longitude"]
        # remove letter
        element["Latitude"] = element["Latitude"][:-1]
        element["Longitude"] = element["Longitude"][:-1]

        # add element to jsonResult
        jsonResult.append(element)
      
    #convert python jsonArray to JSON String and write to file
    with open(jsonFilePath, 'w', encoding='utf-8') as jsonf: 
        jsonString = json.dumps(jsonResult, indent=4)
        jsonf.write(jsonString)


csvFilePath = r'C:\wamp64\www\webgl-globe\globe\archive_temperature\GlobalLandTemperaturesByCity.csv'
jsonFilePath = r'C:\wamp64\www\webgl-globe\globe\archive_temperature\GlobalLandTemperaturesByCity.json'

csv_to_json(csvFilePath, jsonFilePath)
