const { Pinecone } = require('@pinecone-database/pinecone');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class VectorStoreTalker {
  static embedingModel = 'text-embedding-ada-002';

  constructor({ vectorStoreApiKey, embeddingApiKey, indexName, hostUrl, minScoreThreshold = 0.8, }) {
    if (!vectorStoreApiKey || !embeddingApiKey) {
      throw new Error('API key and embedding API key are required to initialize VectorStoreTalker.');
    }

    this.vectorStoreApiKey = vectorStoreApiKey;
    this.embeddingApiKey = embeddingApiKey;
    this.indexName = indexName;
    this.client = new Pinecone({ apiKey: this.vectorStoreApiKey });
    this.index = this.client.index(indexName, hostUrl);
    this.minScoreThreshold = minScoreThreshold;
  }

  async storeStringsInPinecone({ strings }) {
    // console.log("strings: ", strings, " and ", typeof strings, " and ", strings.length === 0);
    if (strings.length === 0) {
      throw new Error('Input must be a non-empty array of strings.');
    }

    try {
      const vectors = await Promise.all(
        strings.map(async (string) => {
          const vector = await this.embedStringToVector(string);
          // there is an unkonwn error to upsert all the vectors at once
          // so this is a temporary solution to upsert one by one
          await this.index.upsert([
            {
              id: string, // uuidv4(), // allow overriding.
              values: vector,
              metadata: { text: string }
            }
          ]);
          // return {
          //   id: `${string}-${uuidv4()}`,
          //   values: vector,
          //   // metadata: { originalString: string },
          // };
        })
      );
      // console.log("vectors: ", vectors);
      // this.index.upsert({ vectors });

      console.log('Strings successfully stored in Pinecone.');
    } catch (error) {
      console.error('Error storing strings in Pinecone:', error);
      throw error;
    }
  }

  async embedStringToVector(string) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: VectorStoreTalker.embedingModel,
          input: string,
        },
        {
          headers: {
            Authorization: `Bearer ${this.embeddingApiKey}`,
          },
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  // searchString can be a product name or a description.
  async searchForComplainOfAnItem({ itemName, queryString, maxResults = 10 }) {
    if (itemName || queryString) {
      const queryTerm = itemName; // for now, only query for the item name.
      const queryResponse = await this.index.namespace('').query({
        vector: await this.embedStringToVector(itemName),
        topK: maxResults,
        includeValues: true,
      });
      console.log('queryResponse: ', queryResponse);
      for (let i = 0; i < queryResponse.matches.length; i++) {
        // filter out the results that are not relevant.
        if (queryResponse.matches[i].score < this.minScoreThreshold) {
          queryResponse.matches.splice(i, 1);
          i--;
        }
      }

      // later: add a score check. if score is not high enough, then we need to filter it out.
      return {
        itemName: itemName,
        complains: queryResponse.matches.map((result) => result.id),
      };
    } else {
      return null;
    }
  }
}

module.exports = VectorStoreTalker;