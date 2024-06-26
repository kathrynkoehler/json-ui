/**
 * decompose the json files into more accessible versions that are quicker
 * to read from
 */


'use strict';

(function () {

  const QUERY_URL = 'https://lululemon.c.lucidworks.cloud/api/apps/LLM_us/query/LLM_us?q=';
  const DEBUG_URL = '&debug=results&debug.explain.structured=true';

  // holds extracted details from json
  let allDetails = {};
  let allProducts = {};

  window.addEventListener('load', init);

  /**
   * initializes the program on page load. the refresh button is set to read the
   * contents of the json-files directory, parse it, and begin the process
   * of decomposing it.
   */
  function init() {
    // this will be deleted when search is functional
    let refresh = document.getElementById("refresh");
    refresh.addEventListener("click", getData);

    let cookieId = 'id=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJwY3VycmFuIiwicGVybWlzc2lvbnMiOltdLCJzY29wZSI6WyJvcGVuaWQiLCJlbWFpbCIsInByb2ZpbGUiXSwiaXNzIjoiaHR0cDpcL1wvcHJveHk6Njc2NFwvb2F1dGgyXC9kZWZhdWx0IiwicmVhbG0iOiJuYXRpdmUiLCJleHAiOjE3MTk0MjE3OTUsImlhdCI6MTcxOTQxOTk5NSwidXNlcklkIjoiY2IwZTA2OTAtMjM1Ny00M2Y3LTkzNzUtOGMwMzM2OWMxNzA4IiwicGVybWlzc2lvbnNfdnMiOjg1OTY2NTYxMDcsImF1dGhvcml0aWVzIjpbInJlYWRvbmx5Il19.HB18plg08Zrw6hkKilPDQ_X4QwKFPx2AsdihhS_9r-9r0wWAROIlgf2xglPl3lS3Hh29MtybtcGFOWpUEHycNUej6kpzHXauNhVEFQHcrRR8bwt3YlbODx1ogRFc5QqWAsrs13gDlElS_3I2_qLioj4yS820WuUbv12w7cVCwpsDD8ZU0HG98zSm8F672UlE48CgzkMOt9YAh5ovQ-VQdELnA-aPcsycNRmXetF308NzrRCbiivHBtWwIJBV94M-UJheGmWW81d-3NzGQXvlhfIgybUbQQeQFG42E7J6Rz1uPhEFMgNx4j-B6IemzXlYpcfWlQPFTDrqnj_-MhWzOQ';
    document.cookie = cookieId;


    id('search-form').addEventListener('submit', (e) => {
      e.preventDefault;
      queryData(e);
    });
  }

  /**
   * queries data directly from api.
   */
  async function queryData(e) {
    e.preventDefault();
    try {
      // get the search, query api
      let search = id('searchbar').value;
      search = search.split(' ').join('%20');
      let res = await fetch(QUERY_URL + search + DEBUG_URL, {
        'authority': 'lululemon-dev.c.lucidworks.cloud',
        'method': 'GET',
        'credentials': 'include',
      });
      await statusCheck(res);
      res = res.json();   // this is our new "dirty" data to parse
      console.log(res);

      // parse to "clean" file
        // rewrite grabOneJson, eliding initial fetch to file
    } catch (err) {
      console.error('queryData: ' + err);
    }
  }

  /**
   * reads the directory to get a list of all data files to parse.
   */
  async function getData() {
    try {
      let fileNames = await grabAllJson();
      for (let i = 0; i < fileNames.length; i++) {
        //console.log(fileNames[i]);
        await grabOneJson(fileNames[i]);
      }
      await writeProducts();
    } catch (err) {
      console.error('init ' + err);
    }
  }

  /**
   * retrieves the list of files within the json-files directory.
   * @returns array of file names within directory
   */
  async function grabAllJson() {
    try {
      let res = await fetch('/files');
      await statusCheck(res);
      let data = await res.json();
      return data;
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * grabs the product data for one JSON file. called from getData().
   * @param {String} filename - the file to read
   */
  async function grabOneJson(filename) {
    try {
      let res = await fetch(`/files/${filename}`);
      await statusCheck(res);
      let data = await res.json();

      // decompose products list, then write to new file from allProducts
      filename = filename.split(" ").join("-");
      filename = filename.split(".")[0];
      await decomposeSKU(data, filename);

      // this file ends up being too big, so we have to write once per file
      // instead of all files at once
      await writeDetails(filename);
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Decomposes the JSON from the original data files, extracting useful fields
   * to save for each listed product. Also extracts score details and saves
   * those breakdowns.
   * @param {Object} data - the JSON data to parse
   * @param {String} filename - the file being parsed. used to organize the 
   *                  resulting decomposed data.
   */
  function decomposeSKU(data, filename) {
    const skus = data["debug"]["explain"];
    let item;
    let value;
    allProducts[filename] = {};
    allDetails[filename] = {};

    for (item in skus) {
      let prodId = item.split('_').slice(1)[0];
      let skuId = item.split('_')[0];
      value = skus[item].value;

      // check if product id already has an object
      let array = setData(data, prodId, skuId);

      // if (!array) {
      //   console.log("no array");
      // }

      // console.log(typeof(array));
      // // console.log(skuId);
      // let displayName = array[0];
      // let size = array[1];
      // let img = array[2];
      // let price = array[3];
      // let skuimg = array[4];
      // console.log(displayName, size, img, skuimg, price);

      if (!allProducts[filename][prodId]) {
        allProducts[filename][prodId] = {
          'productId': prodId,
          'displayName' : array[0],
          'size': array[1],    // when image removed, change to [1]
          'prodImg': array[2],
          'skus': {}
        }
      }
      // console.log((array[2]).toString());
      allProducts[filename][prodId]['skus'][skuId] = {
        'skuScore': value, 
        'skuImg': array[3],
        // 'color': array[4],
        'price': array[4]
      };
      
      // extract details for every sku_prodid item
      let depth = 0;
      allDetails[filename][item] = [];
      let newObj = traverseDetails(depth, filename, item, (skus[item]));
    }
  }

  /**
   * Grabs the image and displayName from "response" "docs" object in the file.
   * Saves these as an array that will later be saved in the "cleaned" data object.
   * @param {Object} data - the JSON to parse
   * @param {String} productId - the product whose image and name we are retrieving
   * @returns array of displayname + image for each product
   */
  function setData(data, productId, skuId) {
    let docs = data["response"]["docs"];
    let item;

    // for each product, find details list
    for (item in docs) {
      // console.log(docs[item]["product_id"]);
      // console.log(productId);
      if (docs[item]["product_id"] === productId) { //&& docs[item]["sku_id"] === skuId
        let array = [docs[item]["product_displayName"],   // object[0]
            docs[item]["sku_size"],                       // object[1]
            docs[item]["sku_skuImages"][0],               // object[2] (prod img)
            // docs[item]["list_price"]
          ];                    // object[3]

        let skuslist = docs[item]["style_order_list"];

        for (let i = 0; i < skuslist.length; i++) {
          // console.log(i);
          // console.log(skuslist[i]["sku_id"]);
          // console.log(skuId);
          if (skuslist[i]["sku_id"] === skuId) {
            // console.log(skuslist[i]);

            let colors = [skuslist[i]["sku_colorGroup"], 
              skuslist[i]["sku_colorCodeDesc"]];

            array.push(
              skuslist[i]["sku_skuImages"][0],    // object[3]
              skuslist[i]["list_price"],          // object[4]
              colors                              // object[5]
            );
            return array;
          }
        }
        // console.log(typeof(array));
        return array;
      }
    }
  }

  /**
   * Recursive function traverses the nested JSON object containing the score
   * breakdown for each item. The score value and description are saved into an
   * array, along with the depth of that score in the nested JSON object. 
   * @param {Number} depth - the current depth of the nested object
   * @param {String} filename - the file being parsed
   * @param {String} prodId - the ID of the product's score being parsed
   * @param {Object} item - the JSON object being traversed
   * @returns the array of score depth + description + value for each nested object
   */
  function traverseDetails(depth, filename, prodId, item) {
    // for each field in json, check if it's 'details'
    let object = [];
    Object.keys(item).forEach(key => {
      if (typeof item[key] === 'object' && item[key] !== null && key === "details") {
        // if details, pull out the score and description
        let short = item["details"];
        for (let i = 0; i < short.length; i++) {
          allDetails[filename][prodId].push([depth+1, short[i]["description"], short[i]["value"]]);
          // then check for more details
          traverseDetails(depth+1, filename, prodId, short[i]);
        }
        // when finished with one obj, do the other nested ones too
        traverseDetails(depth, filename, prodId, item["details"]);
      } else {
        return object;
      }
    });
  }

  /**
   * Write product data into a new file. This saves us from having to manually 
   * parse the original data on every page load.
   */
  async function writeProducts() {
    try {
      let data = new FormData();
      data.append('content', JSON.stringify(allProducts));
      let res2 = await fetch('/write/products', {method: 'POST', body: data});
      await statusCheck(res2);
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Write product score details into a new file. This saves us fro having to
   * manually parse the original data on every page load. The score data is too
   * large to write and read the entire directory at once, so each file from the
   * original data directory has its own corresponding "clean" version written here.
   * @param {String} filename - the file whose data is being parsed.
   */
  async function writeDetails(filename) {
    try {
      let data = new FormData();
      data.append('file', filename);
      data.append('content', JSON.stringify(allDetails[filename]));
      let res = await fetch('/write/details', {method: 'POST', body: data});
      await statusCheck(res);
    } catch (err) {
      console.error(err);
    }
  }

  /* HELPERS!! */

  // statuscheck for fetch
  async function statusCheck(response) {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response;
  }

  function id(idName) {
    return document.getElementById(idName);
  }

})();