/* global describe, it, before, after, assert, Zotero, Components */

// People (people.ts, branch people2; plan approved by MJT 2026-11-22: "I want
// that data only in Weavero, in a structured way, with a special interface
// especially designed to build and check the data on other researchers").
//
// - The record (lib/people-record.ts): every fact with each source's value
//   side by side; Keep / Reject / Edit; a choice survives every Refresh; a
//   later conflicting value comes as an alternative marked new; a rejected one
//   never comes back.
// - The sources read into lines (lib/people-sources.ts): OpenAlex, ORCID,
//   theses.fr and IdRef (confirmed), Wikidata (doctoral advisor P184 / student
//   P185, the QLever mirror's answer recorded 2026-11-22), the followed lists.
// - The People tab: Add to People from an author (the right-click entry), the
//   lookup -- with the NETWORK MOCKED: every request goes through the plugin's
//   `_wvPeopleGet`, answered here from the public APIs' own answers, recorded
//   once on 2026-11-22 for Alban Sauret, a public researcher of the research
//   doc (Detlef Lohse's name search for the homonyms), trimmed to the parts the
//   parsers read; `Zotero.HTTP.request` refuses while the suite runs -- the
//   facts side by side, the links, the family tree, the publications marked in
//   the library, Build from followed authors with its progress and Stop.
// - people.json holds it all; NOTHING is written into any Zotero library (the
//   item, note and collection counts are taken around every action).
// Everything made is erased at the end (the items, people.json, the cache).

describe("Weavero — People: the records, the sources, the People tab", function () {
    this.timeout(180000);
    let wv, lib, win, doc, ZT;
    const made = { items: [] };
    let origHttp = null, httpCalls = [];
    const calls = [];
    // Per test: a fixture changed, an answer that fails, a slow answer.
    const over = { theses: null, failORCID: false, failWDQS: true, slow: 0 };
    const today = () => /** @type {any} */ (wvT.lib()).wvPpToday();

    // The recorded answers (2026-11-22), see the header.
    const FX = {
     "openalexAuthor": {
      "id": "https://openalex.org/A5030022491",
      "display_name": "Alban Sauret",
      "display_name_alternatives": [
       "A Sauret",
       "A. SAURET",
       "A. Sauret",
       "Alban Sauret",
       "Sauret, A",
       "Sauret, Alban"
      ],
      "orcid": "https://orcid.org/0000-0001-7874-5983",
      "works_count": 219,
      "last_known_institutions": [
       {
        "id": "https://openalex.org/I154570441",
        "ror": "https://ror.org/02t274463",
        "display_name": "University of California, Santa Barbara",
        "country_code": "US",
        "type": "education",
        "lineage": [
         "https://openalex.org/I154570441"
        ]
       },
       {
        "id": "https://openalex.org/I66946132",
        "ror": "https://ror.org/047s2c258",
        "display_name": "University of Maryland, College Park",
        "country_code": "US",
        "type": "education",
        "lineage": [
         "https://openalex.org/I66946132"
        ]
       }
      ],
      "affiliations": [
       {
        "institution": {
         "id": "https://openalex.org/I102197404",
         "ror": "https://ror.org/028rypz17",
         "display_name": "Université Paris-Sud",
         "country_code": "FR",
         "type": "education",
         "lineage": [
          "https://openalex.org/I102197404",
          "https://openalex.org/I277688954"
         ]
        },
        "years": [
         2018,
         2017
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I113428412",
         "ror": "https://ror.org/04zmssz18",
         "display_name": "École Normale Supérieure de Lyon",
         "country_code": "FR",
         "type": "education",
         "lineage": [
          "https://openalex.org/I113428412",
          "https://openalex.org/I203339264"
         ]
        },
        "years": [
         2010
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I123791789",
         "ror": "https://ror.org/02fdb8q57",
         "display_name": "Saint-Gobain (France)",
         "country_code": "FR",
         "type": "company",
         "lineage": [
          "https://openalex.org/I123791789"
         ]
        },
        "years": [
         2017,
         2015,
         2012
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I1294671590",
         "ror": "https://ror.org/02feahw73",
         "display_name": "Centre National de la Recherche Scientifique",
         "country_code": "FR",
         "type": "government",
         "lineage": [
          "https://openalex.org/I1294671590"
         ]
        },
        "years": [
         2024,
         2020,
         2019,
         2018,
         2017,
         2016,
         2015,
         2014,
         2013,
         2012,
         2010
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I136199984",
         "ror": "https://ror.org/03vek6s52",
         "display_name": "Harvard University",
         "country_code": "US",
         "type": "education",
         "lineage": [
          "https://openalex.org/I136199984"
         ]
        },
        "years": [
         2010
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I154570441",
         "ror": "https://ror.org/02t274463",
         "display_name": "University of California, Santa Barbara",
         "country_code": "US",
         "type": "education",
         "lineage": [
          "https://openalex.org/I154570441"
         ]
        },
        "years": [
         2026,
         2025,
         2024,
         2023,
         2022,
         2021,
         2020,
         2019,
         2018
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I20089843",
         "ror": "https://ror.org/00hx57361",
         "display_name": "Princeton University",
         "country_code": "US",
         "type": "education",
         "lineage": [
          "https://openalex.org/I20089843"
         ]
        },
        "years": [
         2015,
         2014,
         2013
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I21491767",
         "ror": "https://ror.org/035xkbk20",
         "display_name": "Aix-Marseille Université",
         "country_code": "FR",
         "type": "education",
         "lineage": [
          "https://openalex.org/I21491767"
         ]
        },
        "years": [
         2017,
         2014,
         2013,
         2012
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I277688954",
         "ror": "https://ror.org/03xjwb503",
         "display_name": "Université Paris-Saclay",
         "country_code": "FR",
         "type": "education",
         "lineage": [
          "https://openalex.org/I277688954"
         ]
        },
        "years": [
         2024,
         2018,
         2017
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I2803209242",
         "ror": "https://ror.org/00pjdza24",
         "display_name": "University of California System",
         "country_code": "US",
         "type": "education",
         "lineage": [
          "https://openalex.org/I2803209242"
         ]
        },
        "years": [
         2021
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I4210118056",
         "ror": "https://ror.org/02byv2846",
         "display_name": "Fluides, Automatique et Systèmes Thermiques",
         "country_code": "FR",
         "type": "facility",
         "lineage": [
          "https://openalex.org/I1294671590",
          "https://openalex.org/I277688954",
          "https://openalex.org/I4210118056"
         ]
        },
        "years": [
         2024,
         2018,
         2017
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I4210141213",
         "ror": "https://ror.org/04kadgz77",
         "display_name": "Surface du Verre et Interfaces",
         "country_code": "FR",
         "type": "facility",
         "lineage": [
          "https://openalex.org/I1294671590",
          "https://openalex.org/I4210098836",
          "https://openalex.org/I4210141213"
         ]
        },
        "years": [
         2020,
         2019,
         2018,
         2017,
         2016,
         2015,
         2014,
         2012
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I4210142713",
         "ror": "https://ror.org/03zq0xc17",
         "display_name": "Institut de Recherche sur les Phénomènes Hors Équilibre",
         "country_code": "FR",
         "type": "facility",
         "lineage": [
          "https://openalex.org/I1294671590",
          "https://openalex.org/I21491767",
          "https://openalex.org/I4210095849",
          "https://openalex.org/I4210142713",
          "https://openalex.org/I4210142724"
         ]
        },
        "years": [
         2017,
         2014,
         2013,
         2012,
         2011,
         2010,
         2009
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I4210142724",
         "ror": "https://ror.org/040baw385",
         "display_name": "Centrale Méditerranée",
         "country_code": "FR",
         "type": "education",
         "lineage": [
          "https://openalex.org/I4210142724"
         ]
        },
        "years": [
         2014,
         2013
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I4387154789",
         "ror": "https://ror.org/04mnmrh54",
         "display_name": "Saint-Gobain Recherche Paris",
         "country_code": "FR",
         "type": "facility",
         "lineage": [
          "https://openalex.org/I4387154789"
         ]
        },
        "years": [
         2017,
         2015,
         2012
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I57206974",
         "ror": "https://ror.org/0190ak572",
         "display_name": "New York University",
         "country_code": "US",
         "type": "education",
         "lineage": [
          "https://openalex.org/I57206974"
         ]
        },
        "years": [
         2017
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I66946132",
         "ror": "https://ror.org/047s2c258",
         "display_name": "University of Maryland, College Park",
         "country_code": "US",
         "type": "education",
         "lineage": [
          "https://openalex.org/I66946132"
         ]
        },
        "years": [
         2026,
         2025,
         2024,
         2023
        ]
       },
       {
        "institution": {
         "id": "https://openalex.org/I889458895",
         "ror": "https://ror.org/02zhqgq86",
         "display_name": "University of Hong Kong",
         "country_code": "HK",
         "type": "education",
         "lineage": [
          "https://openalex.org/I889458895"
         ]
        },
        "years": [
         2013,
         2012
        ]
       }
      ],
      "ids": {
       "openalex": "https://openalex.org/A5030022491",
       "orcid": "https://orcid.org/0000-0001-7874-5983",
       "observed_orcids": [
        "https://orcid.org/0000-0001-7874-5983"
       ]
      }
     },
     "openalexSearchSauret": {
      "meta": {
       "count": 1
      },
      "results": [
       {
        "id": "https://openalex.org/A5030022491",
        "display_name": "Alban Sauret",
        "orcid": "https://orcid.org/0000-0001-7874-5983",
        "works_count": 219,
        "last_known_institutions": [
         {
          "id": "https://openalex.org/I154570441",
          "ror": "https://ror.org/02t274463",
          "display_name": "University of California, Santa Barbara",
          "country_code": "US",
          "type": "education",
          "lineage": [
           "https://openalex.org/I154570441"
          ]
         },
         {
          "id": "https://openalex.org/I66946132",
          "ror": "https://ror.org/047s2c258",
          "display_name": "University of Maryland, College Park",
          "country_code": "US",
          "type": "education",
          "lineage": [
           "https://openalex.org/I66946132"
          ]
         }
        ]
       }
      ],
      "group_by": []
     },
     "openalexSearchLohse": {
      "meta": {
       "count": 7
      },
      "results": [
       {
        "id": "https://openalex.org/A5066010665",
        "display_name": "Detlef Lohse",
        "orcid": "https://orcid.org/0000-0003-4138-2255",
        "works_count": 1424,
        "last_known_institutions": [
         {
          "id": "https://openalex.org/I4210088711",
          "ror": "https://ror.org/0087djs12",
          "display_name": "Max Planck Institute for Dynamics and Self-Organization",
          "country_code": "DE",
          "type": "facility",
          "lineage": [
           "https://openalex.org/I149899117",
           "https://openalex.org/I4210088711"
          ]
         },
         {
          "id": "https://openalex.org/I4210122839",
          "ror": "https://ror.org/02n9d1732",
          "display_name": "Max Planck University of Twente Center for Complex Fluid Dynamics",
          "country_code": "NL",
          "type": "facility",
          "lineage": [
           "https://openalex.org/I149899117",
           "https://openalex.org/I4210122839",
           "https://openalex.org/I94624287"
          ]
         },
         {
          "id": "https://openalex.org/I94624287",
          "ror": "https://ror.org/006hf6230",
          "display_name": "University of Twente",
          "country_code": "NL",
          "type": "education",
          "lineage": [
           "https://openalex.org/I94624287"
          ]
         }
        ]
       },
       {
        "id": "https://openalex.org/A5103984748",
        "display_name": "Lohse Detlef",
        "orcid": null,
        "works_count": 2,
        "last_known_institutions": null
       },
       {
        "id": "https://openalex.org/A5130371349",
        "display_name": "Detlef Lohse",
        "orcid": null,
        "works_count": 1,
        "last_known_institutions": null
       },
       {
        "id": "https://openalex.org/A5129253316",
        "display_name": "Detlef Lohse",
        "orcid": null,
        "works_count": 11,
        "last_known_institutions": null
       },
       {
        "id": "https://openalex.org/A5105933155",
        "display_name": "Detlef Lohse",
        "orcid": null,
        "works_count": 3,
        "last_known_institutions": null
       }
      ],
      "group_by": []
     },
     "openalexWorks": {
      "meta": {
       "count": 200
      },
      "results": [
       {
        "id": "https://openalex.org/W4407500954",
        "doi": "https://doi.org/10.1016/j.jcp.2026.115533",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7202196426",
        "doi": "https://doi.org/10.1039/d6sm00328a",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7220380485",
        "doi": "https://doi.org/10.48550/arxiv.2610.02543",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7172434665",
        "doi": "https://doi.org/10.1039/d6sm00482b",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7165115190",
        "doi": "https://doi.org/10.1039/d6sm00314a",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7172384912",
        "doi": "https://doi.org/10.1039/d6sm00482b/v2/response1",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7163013386",
        "doi": "https://doi.org/10.1017/jfm.2026.11597",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7162193143",
        "doi": "https://doi.org/10.17632/kt5wxjptzd",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7118424308",
        "doi": "https://doi.org/10.1103/rfk8-jtj9",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7125220705",
        "doi": "https://doi.org/10.1103/3g2f-nslz",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W7162109970",
        "doi": "https://doi.org/10.13016/llmg-mcay",
        "publication_year": 2026
       },
       {
        "id": "https://openalex.org/W4414791612",
        "doi": "https://doi.org/10.1146/annurev-fluid-100224-111013",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4411488753",
        "doi": "https://doi.org/10.1103/ynxr-zmg2",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4409244614",
        "doi": "https://doi.org/10.1016/j.jcis.2025.137518",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4409100091",
        "doi": "https://doi.org/10.1017/jfm.2025.127",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4407086627",
        "doi": "https://doi.org/10.1039/d4sm01324g",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4408150580",
        "doi": "https://doi.org/10.1073/pnas.2415027122",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4407095880",
        "doi": "https://doi.org/10.1039/d4sm01324g/v2/response1",
        "publication_year": 2025
       },
       {
        "id": "https://openalex.org/W4404575045",
        "doi": "https://doi.org/10.1103/aps.dfd.2024.gfm.v2691061",
        "publication_year": 2024
       },
       {
        "id": "https://openalex.org/W4402984116",
        "doi": "https://doi.org/10.1103/physrevapplied.22.034071",
        "publication_year": 2024
       }
      ]
     },
     "openalexWork": {
      "id": "https://openalex.org/W7202196426",
      "doi": "https://doi.org/10.1039/d6sm00328a",
      "authorships": [
       {
        "author_position": "first",
        "author": {
         "id": "https://openalex.org/A5065478740",
         "display_name": "Virgile Thiévenaz",
         "orcid": "https://orcid.org/0000-0002-4756-2946",
         "observed_orcids": [
          "https://orcid.org/0000-0002-4756-2946"
         ]
        },
        "raw_author_name": "Virgile Thiévenaz"
       },
       {
        "author_position": "middle",
        "author": {
         "id": "https://openalex.org/A5046650953",
         "display_name": "Nathan Vani",
         "orcid": "https://orcid.org/0000-0002-7775-4658",
         "observed_orcids": [
          "https://orcid.org/0000-0002-7775-4658"
         ]
        },
        "raw_author_name": "Nathan Vani"
       },
       {
        "author_position": "last",
        "author": {
         "id": "https://openalex.org/A5030022491",
         "display_name": "Alban Sauret",
         "orcid": "https://orcid.org/0000-0001-7874-5983",
         "observed_orcids": [
          "https://orcid.org/0000-0001-7874-5983"
         ]
        },
        "raw_author_name": "Alban Sauret"
       }
      ]
     },
     "orcidRecord": {
      "orcid-identifier": {
       "uri": "https://orcid.org/0000-0001-7874-5983",
       "path": "0000-0001-7874-5983",
       "host": "orcid.org"
      },
      "person": {
       "name": {
        "created-date": {
         "value": 1460755140652
        },
        "last-modified-date": {
         "value": 1460755140652
        },
        "given-names": {
         "value": "Alban"
        },
        "family-name": {
         "value": "Sauret"
        },
        "credit-name": null,
        "source": null,
        "visibility": "public",
        "path": "0000-0001-7874-5983"
       },
       "researcher-urls": {
        "researcher-url": [
         {
          "url-name": "Group website",
          "url": {
           "value": "http://sauretlab.umd.edu/"
          }
         }
        ]
       }
      },
      "activities-summary": {
       "employments": {
        "affiliation-group": [
         {
          "summaries": [
           {
            "employment-summary": {
             "put-code": 25906374,
             "department-name": "Mechanical Engineering",
             "role-title": "Associate Professor and Clark Faculty Fellow",
             "start-date": {
              "year": {
               "value": "2025"
              },
              "month": {
               "value": "01"
              },
              "day": null
             },
             "end-date": null,
             "organization": {
              "name": "University of Maryland, College Park",
              "address": {
               "city": "College Park",
               "region": null,
               "country": "US"
              }
             },
             "url": {
              "value": "https://enme.umd.edu/clark/faculty/1918/Alban-Sauret"
             },
             "path": "/0000-0001-7874-5983/employment/25906374"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "employment-summary": {
             "put-code": 21142680,
             "department-name": "Mechanical Engineering",
             "role-title": "Associate Professor",
             "start-date": {
              "year": {
               "value": "2022"
              },
              "month": null,
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2024"
              },
              "month": null,
              "day": null
             },
             "organization": {
              "name": "University of California, Santa Barbara",
              "address": {
               "city": "Santa Barbara",
               "region": "CA",
               "country": "US"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/employment/21142680"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "employment-summary": {
             "put-code": 6967829,
             "department-name": "Mechanical Engineering",
             "role-title": "Assistant Professor",
             "start-date": {
              "year": {
               "value": "2018"
              },
              "month": null,
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2022"
              },
              "month": null,
              "day": null
             },
             "organization": {
              "name": "University of California Santa Barbara",
              "address": {
               "city": "Santa Barbara",
               "region": "CA",
               "country": "US"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/employment/6967829"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "employment-summary": {
             "put-code": 2209251,
             "department-name": "Physics",
             "role-title": "Tenured Research Scientist",
             "start-date": {
              "year": {
               "value": "2014"
              },
              "month": null,
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2018"
              },
              "month": null,
              "day": null
             },
             "organization": {
              "name": "CNRS",
              "address": {
               "city": "Aubervilliers",
               "region": null,
               "country": "FR"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/employment/2209251"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "employment-summary": {
             "put-code": 21142698,
             "department-name": "Mechanical and Aerospace Engineering",
             "role-title": "Visiting Researcher",
             "start-date": {
              "year": {
               "value": "2014"
              },
              "month": {
               "value": "10"
              },
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2016"
              },
              "month": {
               "value": "08"
              },
              "day": null
             },
             "organization": {
              "name": "New York University",
              "address": {
               "city": "New York",
               "region": "NY",
               "country": "US"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/employment/21142698"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "employment-summary": {
             "put-code": 21563939,
             "department-name": "Mechanical and Aerospace Engineering",
             "role-title": "Postdoctoral Researcher",
             "start-date": {
              "year": {
               "value": "2013"
              },
              "month": {
               "value": "02"
              },
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2014"
              },
              "month": {
               "value": "09"
              },
              "day": null
             },
             "organization": {
              "name": "Princeton University",
              "address": {
               "city": "Princeton",
               "region": "New Jersey",
               "country": "US"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/employment/21563939"
            }
           }
          ]
         }
        ]
       },
       "educations": {
        "affiliation-group": [
         {
          "summaries": [
           {
            "education-summary": {
             "put-code": 21142459,
             "department-name": "Physics",
             "role-title": "PhD",
             "start-date": {
              "year": {
               "value": "2009"
              },
              "month": null,
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2013"
              },
              "month": null,
              "day": null
             },
             "organization": {
              "name": "Aix-Marseille University",
              "address": {
               "city": "Marseille",
               "region": null,
               "country": "FR"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/education/21142459"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "education-summary": {
             "put-code": 21142454,
             "department-name": "Physics",
             "role-title": "MS",
             "start-date": {
              "year": {
               "value": "2007"
              },
              "month": null,
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2009"
              },
              "month": null,
              "day": null
             },
             "organization": {
              "name": "École Normale Supérieure de Lyon",
              "address": {
               "city": "Lyon",
               "region": null,
               "country": "FR"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/education/21142454"
            }
           }
          ]
         },
         {
          "summaries": [
           {
            "education-summary": {
             "put-code": 21142449,
             "department-name": "Physics",
             "role-title": "BS",
             "start-date": {
              "year": {
               "value": "2006"
              },
              "month": null,
              "day": null
             },
             "end-date": {
              "year": {
               "value": "2007"
              },
              "month": null,
              "day": null
             },
             "organization": {
              "name": "École Normale Supérieure de Lyon",
              "address": {
               "city": "Lyon",
               "region": null,
               "country": "FR"
              }
             },
             "url": null,
             "path": "/0000-0001-7874-5983/education/21142449"
            }
           }
          ]
         }
        ]
       },
       "qualifications": {
        "affiliation-group": []
       }
      }
     },
     "thesesSearch": {
      "totalHits": 2,
      "took": 8,
      "personnes": [
       {
        "id": "151292876",
        "nom": "Sauret",
        "prenom": "Alban",
        "roles": {
         "Auteur / Autrice": 1,
         "Rapporteur / Rapporteuse": 1,
         "Directeur / Directrice": 2,
         "Examinateur / Examinatrice": 2
        },
        "theses": [
         "2013AIXM4703",
         "2021REN1S137",
         "2018SORUS230",
         "2019SORUS531",
         "2021AIXM0315",
         "2022AGRO0029"
        ],
        "disciplines": [
         "Mécanique et Physique des Fluides",
         "Physique",
         "Physique et chimie des matériaux"
        ],
        "etablissements": [
         "Aix-Marseille",
         "Sorbonne université",
         "Rennes 1"
        ],
        "has_idref": true
       },
       {
        "id": "1LGMAaIBJ3SVlNH5l8H2",
        "nom": "Sauret",
        "prenom": "Alban",
        "roles": {
         "Examinateur / Examinatrice": 1
        },
        "theses": [
         "s361322"
        ],
        "disciplines": [
         "Sciences de l'Univers"
        ],
        "etablissements": [
         "Orléans"
        ],
        "has_idref": false
       }
      ]
     },
     "thesesPerson": {
      "id": "151292876",
      "nom": "Sauret",
      "prenom": "Alban",
      "roles": {
       "Auteur / Autrice": 1,
       "Rapporteur / Rapporteuse": 1,
       "Directeur / Directrice": 2,
       "Examinateur / Examinatrice": 2
      },
      "has_idref": true,
      "theses": {
       "Auteur / Autrice": [
        {
         "id": "2013AIXM4703",
         "role": "Auteur / Autrice",
         "titre": "Forçage harmonique d'écoulements en rotation : vents zonaux, ondes inertielles et instabilités.",
         "titres": {
          "fr": "Forçage harmonique d'écoulements en rotation : vents zonaux, ondes inertielles et instabilités."
         },
         "sujets": {
          "en": [
           "Rotating flow",
           "Harmonic forcing",
           "Libration",
           "Tides",
           "Precession",
           "Inertial waves",
           "Instabilities",
           "Zonal flow",
           "Ekman layers"
          ],
          "fr": [
           "Écoulements en rotation",
           "Forcage harmonique",
           "Libration",
           "Marées",
           "Précession",
           "Ondes inertielles",
           "Instabilités",
           "Écoulement zonal",
           "Couches d'Ekman"
          ]
         },
         "discipline": "Mécanique et Physique des Fluides",
         "resumes": null,
         "status": "soutenue",
         "source": "star",
         "auteurs": [
          {
           "id": "151292876",
           "nom": "Sauret",
           "prenom": "Alban",
           "has_idref": true
          }
         ],
         "directeurs": [
          {
           "id": "074002988",
           "nom": "Le Dizès",
           "prenom": "Stéphane",
           "has_idref": true
          },
          {
           "id": "071032738",
           "nom": "Le Bars",
           "prenom": "Michael",
           "has_idref": true
          }
         ],
         "sujets_rameau": [
          {
           "ppn": "027226069",
           "libelle": "Dynamique des fluides"
          },
          {
           "ppn": "029873967",
           "libelle": "Mouvement rotatoire"
          }
         ],
         "date_soutenance": "2013-02-01",
         "date_inscription": null,
         "etablissement_soutenance": {
          "ppn": "15863621X",
          "nom": "Aix-Marseille",
          "type": null
         },
         "etablissements_cotutelle": []
        }
       ],
       "Directeur / Directrice": [
        {
         "id": "2019SORUS531",
         "role": "Directeur / Directrice",
         "titre": "Hydrodynamique des films liquides hétérogènes",
         "titres": {
          "en": "Hydrodynamics of heterogeneous liquid films",
          "fr": "Hydrodynamique des films liquides hétérogènes"
         },
         "sujets": {
          "en": [
           "Liquid film",
           "Marangoni stress",
           "Evaporation",
           "Theory",
           "Instability",
           "Bubble"
          ],
          "fr": [
           "Film liquide",
           "Contrainte Marangoni",
           "Évaporation",
           "Théorie de la lubrification",
           "Instabilité",
           "Bulle"
          ]
         },
         "discipline": "Hydrodynamique",
         "resumes": null,
         "status": "soutenue",
         "source": "star",
         "auteurs": [
          {
           "id": "25326216X",
           "nom": "Magdelaine-Guillot de Suduiraut",
           "prenom": "Quentin",
           "has_idref": true
          }
         ],
         "directeurs": [
          {
           "id": "189540052",
           "nom": "Antkowiak",
           "prenom": "Arnaud",
           "has_idref": true
          },
          {
           "id": "151292876",
           "nom": "Sauret",
           "prenom": "Alban",
           "has_idref": true
          }
         ],
         "sujets_rameau": [
          {
           "ppn": "05660257X",
           "libelle": "Films liquides (physique)"
          },
          {
           "ppn": "032400144",
           "libelle": "Lubrification hydrodynamique"
          },
          {
           "ppn": "027823024",
           "libelle": "Évaporation"
          },
          {
           "ppn": "027282627",
           "libelle": "Surfaces (physique)"
          }
         ],
         "date_soutenance": "2019-12-20",
         "date_inscription": null,
         "etablissement_soutenance": {
          "ppn": "221333754",
          "nom": "Sorbonne université",
          "type": null
         },
         "etablissements_cotutelle": []
        }
       ]
      }
     },
     "idref": {
      "sudoc": [
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "ISNI",
          "identifiant": "0000000356291698"
         }
        }
       },
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "ORCID",
          "identifiant": "0000-0001-7874-5983"
         }
        }
       },
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "VIAF",
          "identifiant": "http://viaf.org/viaf/181558574"
         }
        }
       },
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "WIKIDATA",
          "identifiant": "https://www.wikidata.org/wiki/Q51689284"
         }
        }
       },
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "SCOPUSID",
          "identifiant": "36519721000"
         }
        }
       },
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "BNF",
          "identifiant": "https://catalogue.bnf.fr/ark:/12148/cb165311438"
         }
        }
       },
       {
        "query": {
         "ppn": "151292876",
         "result": {
          "source": "ZBMATH",
          "identifiant": "sauret.alban"
         }
        }
       }
      ]
     }
    };

    // Wikidata, the QLever mirror's answer (2026-11-22) to the people query by
    // Alban Sauret's ORCID iD: his item, its IdRef id, one doctoral advisor
    // (P184) with that advisor's ids.
    const FXWD = {"head":{"vars":["p","pIdref","pOa","rel","o","oLabel","oOrcid","oIdref","oOa"]},"results":{"bindings":[{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q51689284"},"pIdref":{"type":"literal","value":"151292876"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P184"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q61833503"},"oLabel":{"type":"literal","value":"Michael Le Bars","xml:lang":"en"},"oOrcid":{"type":"literal","value":"0000-0002-4884-6190"},"oIdref":{"type":"literal","value":"071032738"}}]}};
    // The works list was recorded with ids, DOIs and years only; a title for
    // two of them, so the rows read as the tab shows them.
    FX.openalexWorks.results[1].display_name = "Drops on a fibre (WV-TEST)";
    FX.openalexWorks.results[0].display_name = "A paper not in the library (WV-TEST)";
    // Their types and citations, in the shapes OpenAlex gave on 2026-11-25
    // (`type`, `primary_location.source.type`, `biblio`; an article number in
    // both page fields, a preprint in a repository with no biblio).
    Object.assign(FX.openalexWorks.results[0], { type: "article", primary_location: { source: { display_name: "Journal of Computational Physics", type: "journal" } },
        biblio: { volume: "530", issue: "2", first_page: "115533", last_page: "115533" } });
    Object.assign(FX.openalexWorks.results[1], { type: "article", primary_location: { source: { display_name: "Soft Matter", type: "journal" } },
        biblio: { volume: "22", issue: null, first_page: "101", last_page: "110" } });
    Object.assign(FX.openalexWorks.results[2], { type: "preprint", primary_location: { source: { display_name: "arXiv", type: "repository" } },
        biblio: { volume: null, issue: null, first_page: null, last_page: null } });

    const clone = (x) => JSON.parse(JSON.stringify(x));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    /** The mocked services: what each request gets, by its URL. */
    const answer = (url) => {
        const err = (status) => { const e = /** @type {any} */ (new Error("HTTP " + status)); e.status = status; return e; };
        if (url.startsWith("https://api.openalex.org/authors/A5030022491") || url.startsWith("https://api.openalex.org/authors/orcid:0000-0001-7874-5983")) return clone(FX.openalexAuthor);
        if (url.startsWith("https://api.openalex.org/authors/A5066010665")) return clone(FX.openalexSearchLohse.results[0]);
        if (url.startsWith("https://api.openalex.org/authors?search=")) return /Lohse/.test(decodeURIComponent(url)) ? clone(FX.openalexSearchLohse) : /Sauret/.test(decodeURIComponent(url)) ? clone(FX.openalexSearchSauret) : { meta: { count: 0 }, results: [] };
        if (url.startsWith("https://api.openalex.org/works/doi:10.1039/d6sm00328a")) return clone(FX.openalexWork);
        if (url.startsWith("https://api.openalex.org/works/doi:")) throw err(404);
        if (url.startsWith("https://api.openalex.org/works?filter=author.id:A5030022491")) return clone(FX.openalexWorks);
        if (url.startsWith("https://api.openalex.org/works?filter=author.id:")) return { meta: { count: 0 }, results: [] };
        if (url === "https://pub.orcid.org/v3.0/0000-0001-7874-5983/record") { if (over.failORCID) throw err(503); return clone(FX.orcidRecord); }
        if (url.startsWith("https://pub.orcid.org/")) throw err(503);
        if (url.startsWith("https://theses.fr/api/v1/personnes/recherche/")) return /Sauret/.test(decodeURIComponent(url)) ? clone(FX.thesesSearch) : { totalHits: 0, personnes: [] };
        if (url === "https://theses.fr/api/v1/personnes/personne/151292876") return clone(over.theses || FX.thesesPerson);
        if (url === "https://www.idref.fr/services/idref2id/151292876&format=text/json") return clone(FX.idref);
        if (url.startsWith("https://query.wikidata.org/sparql")) { if (over.failWDQS) throw err(429); return clone(FXWD); }
        if (url.startsWith("https://qlever.dev/api/wikidata")) return /0000-0001-7874-5983|Q51689284/.test(decodeURIComponent(url)) ? clone(FXWD) : { head: {}, results: { bindings: [] } };
        throw err(404);
    };

    const ppTab = () => ZT._tabs.find(t => String(t.type).startsWith("wvpeople")) || null;
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const recOf = (last) => wv._wvPeopleAllSync().find(r => r.last === last) || null;
    const linesOf = (rec, fact) => rec.lines.filter(l => l.fact === fact);
    const valRow = (fact, value) => q("[data-wv-pp-fact='" + fact + "'] .wv-pp-val[data-value=\"" + value + "\"]");
    const infoBox = () => doc.querySelector("#zotero-item-pane info-box");
    const rowOf = (last) => {
        const box = infoBox();
        if (!box) return null;
        for (const cv of box.querySelectorAll(".creator-type-value")) {
            const inp = cv.querySelector(".creator-last-name");
            const v = inp && (inp.value != null ? inp.value : inp.getAttribute("value"));
            if (String(v || "") === last) return cv;
        }
        return null;
    };
    const open = (p) => !!(p && (p.state === "open" || p.state === "showing"));
    const counts = async () => {
        const n = (sql) => Zotero.DB.valueQueryAsync(sql);
        return [await n("SELECT COUNT(*) FROM items"), await n("SELECT COUNT(*) FROM itemNotes"), await n("SELECT COUNT(*) FROM collections"), await n("SELECT COUNT(*) FROM itemData")].join("/");
    };
    const notBusy = () => !(wv._wvPeopleBusy && wv._wvPeopleBusy.size);
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const readStore = async () => { try { return JSON.parse(await IOUtils.readUTF8(storePath())); } catch (e) { return null; } };
    let launched = [];

    let A = null, B = null, libCounts = "";   // A: Sauret (with the DOI of one of his papers), B: Lohse (no DOI)

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        if (!lib || typeof lib.wvPpMerge !== "function") wvT.absent("Zotero.Weavero.lib.wvPpMerge");
        for (const m of ["_wvPeopleAddFromItem", "_wvPeopleRefresh", "_wvPeopleTabOpen", "_wvPeopleGet", "_wvPeopleBuild", "_wvPeopleLoad", "_wvPeopleAllSync"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        assert.isOk(FX && FX.orcidRecord, "the recorded answers are in the spec");
        // A clean People store for this suite.
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        // No request leaves the runner. The runner's own reporter posts to the
        // scaffold on localhost through this same function: that one passes.
        origHttp = Zotero.HTTP.request;
        const orig = origHttp;
        Zotero.HTTP.request = function (method, url) {
            const u = String(url);
            if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u)) return orig.apply(this, arguments);
            httpCalls.push(u);
            return Promise.reject(new Error("the People spec refuses the network"));
        };
        wv._wvPeopleGet = async (url) => { calls.push(String(url)); if (over.slow) await sleep(over.slow); return answer(String(url)); };
        wv._launchURL = (u) => { launched.push(String(u)); };
        A = await wvT.createItem("journalArticle", { title: "WV-TEST People: drops on a fibre", DOI: "10.1039/D6SM00328A" });
        A.setCreators([
            { firstName: "Alban", lastName: "Sauret", creatorType: "author" },
            { firstName: "Virgile", lastName: "Thiévenaz", creatorType: "author" },
        ]);
        await A.saveTx();
        B = await wvT.createItem("journalArticle", { title: "WV-TEST People: bubbles" });
        B.setCreators([{ firstName: "Detlef", lastName: "Lohse", creatorType: "author" }]);
        await B.saveTx();
        made.items.push(A, B);
        libCounts = await counts();
    });

    after(async function () {
        try { if (wv._wvPpBuild) wv._wvPpBuild.stop = true; } catch (e) {}
        try { delete wv._wvPeopleGet; } catch (e) {}
        try { delete wv._launchURL; } catch (e) {}
        if (origHttp) Zotero.HTTP.request = origHttp;
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        try { await IOUtils.remove(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-cache"), { recursive: true, ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wvT.erase(...made.items);
        try { ZT.select(ZT._tabs.find(t => String(t.type).startsWith("library")).id); } catch (e) {}
        // The chip clicked last is saved (people3): back to the default for the specs after.
        for (const k of ["people.sort", "people.show", "people.filters"]) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
    });

    // MJT 2026-11-23: his record "A. L. Yarin" (variant "Alexander L. Yarin" from the
    // sources) and the author "Yarin, Alexander L." of one of his books: the author's
    // menu showed Add beside Show. A variant that fits EXACTLY makes the match exact
    // even when the record's own name fits by initials only; Add then stays hidden.
    it("an author matches a record exactly through one of its variants, even when the record's own name fits by initials only", function () {
        wvT.method("_wvPeopleFindByName");
        const rec = lib.wvPpNewRecord("p-yarin", "Yarin", "A. L.");
        // No bare-initial variant ("A Yarin" would fit the author "A." exactly).
        rec.variants = ["Alexander L. Yarin", "Alexander Yarin"];
        const other = lib.wvPpNewRecord("p-other", "Yarin", "B.");
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvPeopleAllSync");
        const orig = wv._wvPeopleAllSync;
        wv._wvPeopleAllSync = () => [rec, other];
        try {
            const full = wv._wvPeopleFindByName("Yarin", "Alexander L.");
            assert.deepEqual(full.map(m => [m.rec.id, m.match]), [["p-yarin", "exact"]], "the full name fits the variant exactly");
            const ini = wv._wvPeopleFindByName("Yarin", "A.");
            assert.deepEqual(ini.map(m => [m.rec.id, m.match]), [["p-yarin", "initials"]], "initials alone stay an initials fit");
        }
        finally { if (own) wv._wvPeopleAllSync = orig; else delete wv._wvPeopleAllSync; }
    });

    // ---- the record ----------------------------------------------------------------

    it("the record: sources side by side; Keep survives a Refresh; a later conflicting value comes as an alternative marked new; Reject never comes back; Edit is the user's own value", function () {
        const rec = lib.wvPpNewRecord("p-test", "Sauret", "Alban");
        const inc = [
            { fact: "phd.institution", value: "Aix-Marseille University", source: "orcid", url: "https://orcid.org/0000-0001-7874-5983" },
            { fact: "phd.institution", value: "Aix-Marseille", source: "thesesfr", url: "https://theses.fr/151292876" },
            { fact: "phd.year", value: "2013", source: "orcid" },
            { fact: "phd.year", value: "2013", source: "thesesfr" },
        ];
        assert.equal(lib.wvPpMerge(rec, clone(inc), "2026-11-22"), 4, "four lines in");
        assert.isTrue(rec.lines.every(l => !l.isNew), "values fetched together are never new to each other");
        let s = lib.wvPpShown(rec, "phd.institution");
        assert.deepEqual([s[0].value, s[0].why, s[0].source, s[0].conflict, s[0].values], ["Aix-Marseille", "confirmed", "thesesfr", true, 2], "no choice: theses.fr first for a PhD; marked");
        const y = lib.wvPpShown(rec, "phd.year");
        assert.isFalse(y[0].conflict, "two sources that agree are no conflict");
        assert.deepEqual(y[0].sources.slice().sort(), ["orcid", "thesesfr"], "the sources that agree");
        assert.isTrue(lib.wvPpAct(rec, "phd.institution", "Aix-Marseille University", "keep"));
        s = lib.wvPpShown(rec, "phd.institution");
        assert.deepEqual([s[0].value, s[0].why, s[0].conflict], ["Aix-Marseille University", "chosen", false]);
        const th = () => rec.lines.find(l => l.fact === "phd.institution" && l.source === "thesesfr");
        assert.equal(th().status, "alternative", "the other value kept, as an alternative");
        assert.equal(lib.wvPpMerge(rec, clone(inc), "2026-11-23"), 0, "a Refresh with the same answers: nothing new");
        assert.equal(rec.lines.find(l => l.fact === "phd.institution" && l.source === "orcid").status, "chosen", "the choice stays");
        assert.equal(th().date, "2026-11-23", "the fetch date follows the last fetch");
        assert.equal(lib.wvPpMerge(rec, [{ fact: "phd.institution", value: "Université d'Aix-Marseille", source: "openalex" }], "2026-11-24"), 1);
        const nl = rec.lines.find(l => l.source === "openalex");
        assert.deepEqual([nl.status, nl.isNew], ["alternative", true], "an alternative, marked new");
        lib.wvPpAct(rec, "phd.year", "2013", "reject");
        lib.wvPpMerge(rec, [{ fact: "phd.year", value: "2013", source: "wikidata" }], "2026-11-25");
        assert.isTrue(rec.lines.filter(l => l.fact === "phd.year").every(l => l.status === "rejected"), "every line of the rejected value");
        assert.deepEqual(lib.wvPpShown(rec, "phd.year"), [], "nothing shown");
        assert.isTrue(lib.wvPpEdit(rec, "phd.year", "2014", "2026-11-25"));
        const mine = rec.lines.find(l => l.fact === "phd.year" && l.source === "me");
        assert.deepEqual([mine.value, mine.status], ["2014", "chosen"], "Edit: the user's own value, kept");
        assert.equal(lib.wvPpShown(rec, "phd.year")[0].value, "2014");
        assert.equal(rec.lines.filter(l => l.fact === "phd.institution").length, 3, "nothing ever deleted");
        // A record read back from people.json, its fields made whole.
        const back = lib.wvPpNormalizeRecord(JSON.parse(JSON.stringify(rec)));
        assert.deepEqual(back.lines.map(l => l.fact + "|" + l.value + "|" + l.source + "|" + l.status), rec.lines.map(l => l.fact + "|" + l.value + "|" + l.source + "|" + l.status));
        assert.isNull(lib.wvPpNormalizeRecord({ last: "x" }), "no id: not a record");
    });

    it("the recorded answers read into lines: OpenAlex, ORCID, theses.fr with its advisors and students, IdRef, Wikidata's advisor with his ids, the works, the homonyms, the followed lists", function () {
        const oa = lib.wvPpFromOpenAlexAuthor(clone(FX.openalexAuthor));
        assert.deepEqual(oa.lines.filter(l => l.fact === "openalex").map(l => l.value), ["A5030022491"]);
        assert.deepEqual(oa.lines.filter(l => l.fact === "institution").map(l => l.value + " (" + l.years + ")"),
            ["University of California, Santa Barbara (2018–2026)", "University of Maryland, College Park (2023–2026)"]);
        assert.include(oa.names, "Sauret, Alban", "the names OpenAlex knows him by");
        const orc = lib.wvPpFromOrcid(clone(FX.orcidRecord), "0000-0001-7874-5983");
        const of = (fact) => orc.filter(l => l.fact === fact).map(l => l.value + (l.years ? " (" + l.years + ")" : ""));
        assert.deepEqual(of("position"), ["Associate Professor and Clark Faculty Fellow (2025–)"], "the current employment only");
        assert.deepEqual(of("phd.institution"), ["Aix-Marseille University"]);
        assert.isTrue(orc.every(l => l.status === "confirmed"));
        const ids = lib.wvPpIdrefIds(clone(FX.idref));
        assert.deepEqual(ids, { orcid: "0000-0001-7874-5983", wikidata: "Q51689284" });
        const th = lib.wvPpFromThesesPerson(clone(FX.thesesPerson), "151292876", ids);
        const adv = th.filter(l => l.fact === "link.advisor");
        assert.deepEqual(adv.map(l => [l.value, l.ref && l.ref.idref, l.years]), [["Stéphane Le Dizès", "074002988", "2013"], ["Michael Le Bars", "071032738", "2013"]], "the advisors, with their IdRef ids");
        const stu = th.filter(l => l.fact === "link.student");
        assert.deepEqual(stu.map(l => [l.value, l.ref && l.ref.idref, l.years]), [["Quentin Magdelaine-Guillot de Suduiraut", "25326216X", "2019"]], "a thesis he supervised: its author");
        assert.deepEqual(th.filter(l => l.fact === "phd.year").map(l => l.value), ["2013"]);
        const q1 = lib.wvPpWikidataQuery({ orcid: "0000-0001-7874-5983" });
        assert.include(q1, "wdt:P496 \"0000-0001-7874-5983\"");
        assert.include(q1, "wdt:P184 wdt:P185", "advisors and students");
        assert.include(lib.wvPpWikidataQuery({ qid: "Q51689284" }), "VALUES ?p { wd:Q51689284 }");
        assert.isNull(lib.wvPpWikidataQuery({}), "no id, no query: never a name");
        const wd = lib.wvPpFromWikidata(clone(FXWD));
        assert.equal(wd.qid, "Q51689284");
        const wadv = wd.lines.filter(l => l.fact === "link.advisor");
        assert.deepEqual(wadv.map(l => [l.value, l.ref.wikidata, l.ref.orcid, l.ref.idref, l.status]), [["Michael Le Bars", "Q61833503", "0000-0002-4884-6190", "071032738", "suggested"]]);
        assert.deepEqual(wd.lines.filter(l => l.fact === "idref").map(l => l.value), ["151292876"]);
        assert.isNull(lib.wvPpFromWikidata({ results: { bindings: [] } }), "no item");
        const works = lib.wvPpWorks(clone(FX.openalexWorks));
        assert.equal(works[1].doi, "10.1039/d6sm00328a");
        assert.equal(works[1].title, "Drops on a fibre (WV-TEST)");
        assert.deepEqual([works[0].type, works[0].volume, works[0].issue, works[0].pages], ["journalArticle", "530", "2", "115533"], "an article number once");
        assert.deepEqual([works[1].pages, works[2].type, works[2].pages], ["101–110", "preprint", undefined], "a page range; a preprint without biblio");
        assert.equal(works[3].type, undefined, "no type given: none");
        assert.deepEqual(["article|conference", "article|repository", "conference-abstract|", "book-chapter|ebook%20platform", "dissertation|", "other|", "something-new|journal"]
            .map(s => lib.wvPpWorkItemType(s.split("|")[0], s.split("|")[1])),
            ["conferencePaper", "preprint", "conferencePaper", "bookSection", "thesis", "document", "document"], "OpenAlex types to Zotero's");
        assert.include(lib.WV_PP_API.openalexWorks(["A1"]), "type,biblio", "the works request asks for them");
        const cands = lib.wvPpCandidates(clone(FX.openalexSearchLohse));
        assert.equal(cands.length, 5, "five profiles carry the name");
        const au = lib.wvPpAuthorOfWork(clone(FX.openalexWork), "Sauret", "Alban");
        assert.deepEqual([au && au.id, au && au.orcid], ["A5030022491", "0000-0001-7874-5983"], "the author of this paper");
        const fileOf = (format) => ({ format, followed_authors: [
            { name: "Alban Sauret", openalex: ["A5030022491"], confidence: "high", enabled: true },
            { name: "Someone Disabled", openalex: ["A5000000009"], enabled: false },
        ] });
        // An alerts file, whatever tool stamped it ("<tool>/alerts/1" or "alerts/1").
        for (const format of ["example-tool/alerts/1", "alerts/1"]) {
            const fe = lib.wvPpFollowEntries(fileOf(format), ["Lohse, Detlef", "Alban Sauret"]);
            assert.deepEqual(fe.map(e => [e.last, e.first, e.openalex.join()]), [["Sauret", "Alban", "A5030022491"], ["Lohse", "Detlef", ""]], format + ": enabled entries with their ids, then Feeds' own names once");
        }
        // Another stamp: not an alerts file, Feeds' own names only.
        assert.deepEqual(lib.wvPpFollowEntries(fileOf("something/else/2"), ["Lohse, Detlef"]).map(e => [e.last, e.first, e.openalex.join()]), [["Lohse", "Detlef", ""]], "a file of another stamp is not read");
        assert.deepEqual([lib.wvPpSplitName("Stéphane Le Dizès"), lib.wvPpSplitName("Johannes Diderik van der Waals"), lib.wvPpSplitName("Sauret, Alban")],
            [{ last: "Le Dizès", first: "Stéphane" }, { last: "van der Waals", first: "Johannes Diderik" }, { last: "Sauret", first: "Alban" }], "names with particles");
    });

    // ---- the People tab ------------------------------------------------------------

    it("Add to People on an author (right-click) makes a record in people.json, opens the People tab on it and looks them up: through this paper, every source side by side, the sources that agree marked -- and nothing in any library", async function () {
        await win.ZoteroPane.selectItem(A.id);
        assert.ok(await wvT.waitFor(() => rowOf("Sauret"), 15000, 100), "Sauret's row");
        const cv = rowOf("Sauret");
        const r = cv.getBoundingClientRect();
        calls.length = 0;
        cv.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2,
            screenX: Math.round(win.mozInnerScreenX + r.left + 20), screenY: Math.round(win.mozInnerScreenY + r.top + 5) }));
        const pop = () => doc.getElementById("zotero-creator-transform-menu");
        assert.ok(await wvT.waitFor(() => open(pop()), 5000, 50), "Zotero's author menu");
        const item = (act) => pop().querySelector("[data-wv-people-act='" + act + "']");
        assert.ok(await wvT.waitFor(() => item("add") && !item("add").hidden, 5000, 50), "Add to People");
        assert.isTrue(!item("show") || item("show").hidden, "no Show in People yet");
        assert.isFalse(item("add").classList.contains("menuitem-iconic"), "no icon slot, as Zotero's own entries of this menu");
        item("add").doCommand();
        try { pop().hidePopup(); } catch (e) {}
        assert.ok(await wvT.waitFor(() => recOf("Sauret"), 8000, 50), "a record");
        const rec = recOf("Sauret");
        assert.ok(await wvT.waitFor(() => ppTab() && ZT.selectedID === ppTab().id, 5000, 50), "the People tab, selected");
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-record='" + rec.id + "']"), 5000, 50), "on the new record");
        assert.ok(await wvT.waitFor(() => notBusy() && linesOf(rec, "phd.year").length, 20000, 100), "looked up: " + JSON.stringify(calls));
        assert.deepEqual([rec.check, rec.followed, rec.from && rec.from.key, rec.from && rec.from.doi], [true, false, A.key, "10.1039/d6sm00328a"], "To check; the item it came from");
        // The requests: the paper's authorship first, then by ids.
        assert.equal(calls[0], "https://api.openalex.org/works/doi:10.1039/d6sm00328a?select=id,doi,authorships", "the paper first");
        for (const u of ["https://api.openalex.org/authors/A5030022491", "https://api.openalex.org/works?filter=author.id:A5030022491",
            "https://pub.orcid.org/v3.0/0000-0001-7874-5983/record", "https://www.idref.fr/services/idref2id/151292876&format=text/json",
            "https://theses.fr/api/v1/personnes/personne/151292876", "https://query.wikidata.org/sparql", "https://qlever.dev/api/wikidata"]) {
            assert.isOk(calls.find(c => c.startsWith(u)), "asked " + u);
        }
        assert.isFalse(calls.some(c => /authors\?search=/.test(c)), "no name search: an id was known through the paper");
        for (const c of calls) {
            assert.notMatch(c, /mailto|api_key|email/i, "a request carries nothing of the user's: " + c);
            assert.match(c, /^https:\/\/(api\.openalex\.org|pub\.orcid\.org|theses\.fr|www\.idref\.fr|query\.wikidata\.org|qlever\.dev)\//, "a public API: " + c);
        }
        assert.deepEqual(httpCalls.filter(u => /openalex|orcid|theses\.fr|idref|wikidata|qlever/i.test(u)), [], "no real request");
        const L = (fact) => linesOf(rec, fact).map(l => [l.value, l.source, l.status].join(" | ")).sort();
        const want = (fact, lines) => assert.deepEqual(L(fact), lines.slice().sort(), fact + ": " + JSON.stringify(L(fact)));
        want("phd.institution", ["Aix-Marseille | thesesfr | confirmed", "Aix-Marseille University | orcid | confirmed"]);
        want("phd.year", ["2013 | orcid | confirmed", "2013 | thesesfr | confirmed"]);
        want("wikidata", ["Q51689284 | idref | confirmed", "Q51689284 | wikidata | suggested"]);
        want("link.advisor", ["Michael Le Bars | thesesfr | confirmed", "Michael Le Bars | wikidata | suggested", "Stéphane Le Dizès | thesesfr | confirmed"]);
        want("link.student", ["Quentin Magdelaine-Guillot de Suduiraut | thesesfr | confirmed"]);
        // people4: OpenAlex's names are forms of the name ("name.other"), no longer `variants`.
        assert.isAbove(linesOf(rec, "name.other").filter(l => l.source === "openalex").length, 0, "the other forms of the name OpenAlex knows");
        // The tab, in its edit mode (MJT 2026-11-26: the sources are the edit mode's): each
        // fact's values side by side, each with its sources.
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.ok(await wvT.waitFor(() => valRow("phd.year", "2013") && q("[data-wv-pp-mode='edit']"), 5000, 50), "drawn again with the facts");
        assert.equal(qa("[data-wv-pp-fact='phd.institution'] .wv-pp-val").length, 2, "the two PhD institutions side by side");
        assert.ok(q("[data-wv-pp-fact='phd.institution'] [data-wv-pp-conflict]"), "the PhD institution's sources disagree: marked");
        const yr = valRow("phd.year", "2013");
        assert.deepEqual(Array.from(yr.querySelectorAll(".wv-pp-src")).map(c => c.getAttribute("data-source")).sort(), ["orcid", "thesesfr"], "each source of the value");
        assert.ok(yr.querySelector("[data-wv-pp-agree='2']"), "two sources agree: marked");
        assert.ok(valRow("link.advisor", "Michael Le Bars").querySelector("[data-wv-pp-agree='2']"), "theses.fr and Wikidata name the same advisor (his IdRef id): one row, two sources");
        assert.ok(valRow("orcid", "0000-0001-7874-5983").querySelector(".wv-pp-vtext[data-wv-url='https://orcid.org/0000-0001-7874-5983']"), "an id links to its record");
        // On disk, in Weavero's data folder.
        const disk = await readStore();
        assert.ok(disk && disk.people.some(p => p.id === rec.id && p.lines.length === rec.lines.length), "people.json holds the record");
        assert.ok(await IOUtils.exists(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-cache", rec.id + ".jsonlz4")), "the raw records and works in people-cache/");
        assert.strictEqual(await counts(), libCounts, "nothing in any library");
        // The author's menu now shows the record.
        await win.ZoteroPane.selectItem(A.id);
        assert.ok(await wvT.waitFor(() => rowOf("Sauret"), 15000, 100));
        const cv2 = rowOf("Sauret"), r2 = cv2.getBoundingClientRect();
        cv2.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2,
            screenX: Math.round(win.mozInnerScreenX + r2.left + 20), screenY: Math.round(win.mozInnerScreenY + r2.top + 5) }));
        assert.ok(await wvT.waitFor(() => open(pop()) && item("show") && !item("show").hidden, 5000, 50), "Show in People");
        assert.isTrue(!item("add") || item("add").hidden, "no second Add");
        item("show").doCommand();
        try { pop().hidePopup(); } catch (e) {}
        assert.ok(await wvT.waitFor(() => ZT.selectedID === ppTab().id && q("[data-wv-pp-record='" + rec.id + "']"), 5000, 50), "the tab on him");
    });

    it("Keep, Reject and Edit in the tab write the record; every choice holds through a Refresh; a new conflicting value comes as an alternative marked new", async function () {
        const rec = recOf("Sauret");
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.ok(await wvT.waitFor(() => valRow("phd.institution", "Aix-Marseille University"), 5000, 50));
        valRow("phd.institution", "Aix-Marseille University").querySelector("[data-wv-pp-do='keep']").click();
        assert.ok(await wvT.waitFor(() => linesOf(rec, "phd.institution").find(l => l.source === "orcid").status === "chosen", 5000, 50), "kept");
        assert.equal(linesOf(rec, "phd.institution").find(l => l.source === "thesesfr").status, "alternative");
        assert.ok(await wvT.waitFor(() => valRow("phd.institution", "Aix-Marseille University") && valRow("phd.institution", "Aix-Marseille University").getAttribute("data-status") === "chosen", 5000, 50), "the tab says so");
        valRow("institution", "University of California, Santa Barbara").querySelector("[data-wv-pp-do='reject']").click();
        assert.ok(await wvT.waitFor(() => linesOf(rec, "institution").filter(l => l.value === "University of California, Santa Barbara").every(l => l.status === "rejected"), 5000, 50), "rejected");
        valRow("phd.year", "2013").querySelector("[data-wv-pp-do='edit']").click();
        const inp = await wvT.waitFor(() => q("[data-wv-pp-editing='phd.year'] input"), 5000, 50);
        assert.ok(inp, "the editor");
        inp.value = "2014";
        inp.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        assert.ok(await wvT.waitFor(() => linesOf(rec, "phd.year").find(l => l.source === "me" && l.value === "2014" && l.status === "chosen"), 5000, 50), "Edit: the user's value, source me");
        assert.deepEqual(linesOf(rec, "phd.year").filter(l => l.source !== "me").map(l => l.status), ["alternative", "alternative"], "the sources' 2013 kept, as alternatives");
        // A Refresh with the same answers: the choices hold.
        let res = await wv._wvPeopleRefresh(rec.id);
        assert.equal(res.added, 0, "nothing new");
        assert.equal(linesOf(rec, "phd.institution").find(l => l.source === "orcid").status, "chosen", "Keep holds");
        assert.isTrue(linesOf(rec, "institution").filter(l => l.value === "University of California, Santa Barbara").every(l => l.status === "rejected"), "Reject holds");
        assert.equal(lib.wvPpShown(rec, "phd.year")[0].value, "2014", "Edit holds");
        // theses.fr now says something else: a new alternative, marked new; the choice holds.
        const changed = clone(FX.thesesPerson);
        changed.theses["Auteur / Autrice"][0].etablissement_soutenance.nom = "Université d'Aix-Marseille";
        over.theses = changed;
        try { res = await wv._wvPeopleRefresh(rec.id); }
        finally { over.theses = null; }
        assert.equal(res.added, 1, "one new value");
        const nl = linesOf(rec, "phd.institution").find(l => l.value === "Université d'Aix-Marseille");
        assert.deepEqual([nl && nl.source, nl && nl.status, nl && !!nl.isNew], ["thesesfr", "alternative", true]);
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-fact='phd.institution'] .wv-pp-new"), 5000, 50), "marked new in the tab");
        assert.strictEqual(await counts(), libCounts, "nothing in any library");
    });

    it("homonyms: with no id and no paper, the profiles with the name are listed and the user picks; the library's items by name stand in for the works; a failed service is said plainly", async function () {
        calls.length = 0;
        await wv._wvPeopleAddFromItem(win, B, "Lohse", "Detlef");
        const rec = recOf("Lohse");
        assert.ok(rec, "a record");
        assert.ok(await wvT.waitFor(() => qa("[data-wv-pp-cand]").length === 5, 10000, 50), "five profiles to pick from");
        assert.deepEqual(calls.map(c => c.split("?")[0]), ["https://api.openalex.org/authors"], "only the name search");
        assert.deepEqual(linesOf(rec, "openalex"), [], "nothing taken on the name alone");
        assert.include(q("[data-wv-pp-cand='A5066010665']").textContent, "0000-0003-4138-2255", "each with what tells them apart");
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-works='offline'] [data-wv-pp-work='item-" + B.id + "']"), 8000, 50), "not looked up yet: the library's items with an author of this name");
        calls.length = 0;
        q("[data-wv-pp-cand='A5066010665']").click();
        assert.ok(await wvT.waitFor(() => notBusy() && linesOf(rec, "openalex").length && q(".wv-pp-status[data-kind='error']"), 10000, 50), "picked; the ORCID lookup failed");
        assert.deepEqual(linesOf(rec, "openalex").map(l => [l.value, l.status]), [["A5066010665", "chosen"]], "the user's pick");
        assert.include(q(".wv-pp-status").textContent, "ORCID");
        assert.include(q(".wv-pp-status").textContent, "503");
        assert.strictEqual(await counts(), libCounts, "nothing in any library");
    });

    // The lineage tree (peoplenet, MJT 2026-11-25): a click on a card centres the tree on it
    // (test/people-lineage.spec.js); Follow adds a person not in Researchers, Open opens one.
    it("links and the family tree: the advisors up, the students down (also from another record's side); Follow adds a person with their ids, Open opens a record", async function () {
        const rec = recOf("Sauret");
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-sec='tree'] .wv-pp-lt-view"), 5000, 50), "the tree");
        const nodes = (kind) => qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card[data-wv-pp-node='" + kind + "']");
        const nm = (n) => (n.querySelector(".wv-pp-lt-name") || {}).textContent;
        const dump = () => JSON.stringify(qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card").map(n => [n.getAttribute("data-wv-pp-node"), n.getAttribute("data-level"), nm(n)]));
        assert.equal(nodes("self").length, 1, dump());
        // Names "Last, First" in the tree by default (people3, MJT 2026-11-24).
        assert.deepEqual(nodes("advisor").map(nm).sort(), ["Le Bars, Michael", "Le Dizès, Stéphane"], "two advisors, a level up");
        const labels = qa("[data-wv-pp-sec='tree'] .wv-pp-lt-elabel").map(e => e.textContent);
        assert.isAtLeast(labels.filter(x => /2013/.test(x)).length, 2, "their edges dated: " + labels.join(" | "));
        assert.equal(nodes("student").length, 1, "one student, a level down: " + dump());
        const ys = (n) => Number(n.getAttribute("data-level"));
        assert.isTrue(nodes("advisor").every(n => ys(n) === -1) && ys(nodes("student")[0]) === 1);
        // Le Bars is not in People: Follow adds him, with his ids, followed.
        const lbCard0 = nodes("advisor").find(n => nm(n).startsWith("Le Bars"));
        assert.strictEqual(lbCard0.getAttribute("data-people"), "false", "a dashed card");
        lbCard0.querySelector(".wv-pp-lt-follow").click();
        assert.ok(await wvT.waitFor(() => recOf("Le Bars"), 5000, 50), "added");
        const lb = recOf("Le Bars");
        assert.deepEqual(["idref", "wikidata", "orcid"].map(k => (lib.wvPpShown(lb, k)[0] || {}).value), ["071032738", "Q61833503", "0000-0002-4884-6190"], "with the ids theses.fr and Wikidata gave");
        assert.isTrue(lb.followed, "followed");
        const lbCard = await wvT.waitFor(() => nodes("advisor").find(n => n.getAttribute("data-wv-pp-person") === lb.id), 5000, 50);
        assert.ok(lbCard, "his card is his record now: " + dump());
        lbCard.querySelector(".wv-pp-lt-open").click();
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-record='" + lb.id + "']"), 5000, 50), "opened");
        // His record: Sauret as his student, from Sauret's side.
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-fact='reverse'] .wv-pp-val[data-value='Alban Sauret']"), 5000, 50), "a student from the other record");
        const stu = qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card[data-wv-pp-node='student'][data-level='1']");
        assert.equal(stu.length, 1, "Le Bars's students: " + dump());
        assert.equal(qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card[data-wv-pp-node='student'][data-level='2']").length, 1, "and two levels down, his student's student, through Sauret's record: " + dump());
        assert.equal(stu[0].getAttribute("data-wv-pp-person"), rec.id, "the card is Sauret's record");
        stu[0].querySelector(".wv-pp-lt-open").click();
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-record='" + rec.id + "']"), 5000, 50), "Open opens him");
        assert.equal(qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card[data-wv-pp-node='advisor'][data-people='true']").length, 1, "Le Bars now a person of People in Sauret's tree: " + dump());
        // A link added by hand: a person of People by that name gets their ids (the add-link
        // row is the edit mode's, MJT 2026-11-26).
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-linktype]"), 5000, 50), "the add-link row");
        const sel = q("[data-wv-pp-linktype]");
        sel.value = "link.postdoc";
        const name = q("[data-wv-pp-focus='linkname']");
        name.value = "Detlef Lohse";
        q("[data-wv-pp-do='link-add']").click();
        assert.ok(await wvT.waitFor(() => linesOf(rec, "link.postdoc").length, 5000, 50), "added");
        const pl = linesOf(rec, "link.postdoc")[0];
        assert.deepEqual([pl.value, pl.source, pl.status, pl.ref && pl.ref.openalex], ["Detlef Lohse", "me", "chosen", "A5066010665"], "the user's link, with Lohse's ids");
        // The researchers of People offered under the field (MJT 2026-11-23: a <datalist> never
        // shows in Zotero's window): every other record, never this one; narrowed as you type,
        // words in any order; the arrow keys and Enter choose one, with that record's ids.
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-record='" + rec.id + "']") && q("[data-wv-pp-focus='linkname']"), 5000, 50), "redrawn after the add");
        q("[data-wv-pp-linktype]").value = "link.linked";
        const field = q("[data-wv-pp-focus='linkname']");
        const opts = () => qa(".wv-pp-pick:not([hidden]) .wv-pp-pickopt");
        field.value = "";
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
        const others = wv._wvPeopleAllSync().filter(p => p.id !== rec.id).length;
        assert.equal(opts().length, others, "an empty field: every other researcher");
        assert.isFalse(opts().some(o => o.getAttribute("data-wv-pp-person") === rec.id), "never the open record");
        field.value = "lohse d";
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.isAbove(opts().length, 0, "words in any order");
        assert.isTrue(opts().every(o => o.textContent.includes("Lohse")), opts().map(o => o.textContent).join(" | "));
        field.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        assert.equal(opts()[0].getAttribute("aria-selected"), "true", "the arrow moves onto the first");
        field.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        assert.ok(await wvT.waitFor(() => linesOf(rec, "link.linked").length, 5000, 50), "chosen");
        const ll = linesOf(rec, "link.linked")[0];
        assert.deepEqual([ll.value, ll.ref && ll.ref.openalex], ["Detlef Lohse", "A5066010665"], "the chosen record's name and ids");
        assert.strictEqual(await counts(), libCounts, "nothing in any library");
    });

    it("publications: the person's works, marked in the library or not (Weavero's matcher), each with its type's icon and its citation, the link in its tooltip; a click opens the library's item, a paper you lack its page", async function () {
        const rec = recOf("Sauret");
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        const w = (id) => q("[data-wv-pp-works='openalex'] [data-wv-pp-work='" + id + "']");
        assert.ok(await wvT.waitFor(() => w("W7202196426") && w("W4407500954"), 20000, 100), "the works, from the cache");
        assert.equal(w("W7202196426").getAttribute("data-in"), "true", "this paper: in the library (by its DOI)");
        assert.equal(w("W4407500954").getAttribute("data-in"), "false", "another: not");
        assert.equal(q("[data-wv-pp-inlib]").getAttribute("data-wv-pp-inlib"), "1");
        // MJT 2026-11-25: "the publications need to have the item type icon when possible";
        // "the full metadata information usually displayed as citation, such as volume and
        // issue numbers"; "Hovering on the links ... must show the link in the tooltip".
        const out = w("W4407500954");
        assert.equal(out.querySelector(".icon-item-type").getAttribute("data-item-type"), "journalArticle", "OpenAlex's article: Zotero's journal article icon");
        assert.equal(out.querySelector("[data-wv-pp-cite]").getAttribute("data-wv-pp-cite"), "Journal of Computational Physics 530 (2), 115533", "journal volume (issue), pages");
        assert.equal(out.querySelector(".wv-pp-wtitle").getAttribute("title"), "https://doi.org/10.1016/j.jcp.2026.115533", "the link a click follows");
        assert.equal(w("W7220380485").getAttribute("data-wv-pp-wtype"), "preprint", "arXiv: a preprint");
        const inl = w("W7202196426");
        assert.equal(inl.querySelector(".icon-item-type").getAttribute("data-item-type"), A.getItemTypeIconName(), "in the library: the item's own icon");
        assert.equal(inl.querySelector(".wv-pp-wtitle").getAttribute("title"), "zotero://select/library/items/" + A.key, "in the library: the item's link");
        // MJT 2026-11-25: "Why not use the same circles convention as in the references?" -- the
        // References' marks: blue dot in your library without a PDF (A has none), grey ring not in it.
        assert.equal(inl.querySelector(".wv-pp-wmark").getAttribute("data-wv-refs-kind"), "nopdf", "in the library, no PDF: the blue dot");
        assert.equal(out.querySelector(".wv-pp-wmark").getAttribute("data-wv-refs-kind"), "web", "not in the library: the grey ring");
        assert.ok(out.querySelector(".wv-pp-wmark svg circle"), "drawn as the References draw it");
        // "Also reuse the same item cards as in the references": the References' card when the
        // pointer rests on a row of the library (refs.ts _wvRefsCardOf).
        // The library index a change of the runner's items schedules (people.ts _wvPeopleLibWire,
        // LIB_REBUILD_MS) draws the tab again when it ends: settled first, or the row hovered is
        // replaced under the pointer and its card never comes (traced on Zotero 10 after
        // people-table.spec.js, 1.3.0-peoplenet.16: _wvPeopleLibIndexBuild -> _wvPeopleRenderAll).
        assert.ok(await wvT.waitFor(() => (!wv._wvPpLibT && !wv._wvPpLibBuilding && !wv._wvPpLibStale ? true : null), 15000, 50), "the library index settled");
        await sleep(50);
        const hov = w("W7202196426");
        hov.dispatchEvent(new win.MouseEvent("mouseenter"));
        const hc = await wvT.waitFor(() => doc.querySelector(".wv-pp-whcard .wv-refs-card[data-wv-refs-card='" + A.id + "']"), 3000, 50);
        assert.ok(hc, "the References' card of the item");
        hov.dispatchEvent(new win.MouseEvent("mouseleave"));
        assert.ok(await wvT.waitFor(() => !doc.querySelector(".wv-pp-whcard"), 3000, 50), "gone once the pointer leaves");
        out.dispatchEvent(new win.MouseEvent("mouseenter"));
        await sleep(700);
        assert.isNull(doc.querySelector(".wv-pp-whcard"), "no card for a paper you lack");
        out.dispatchEvent(new win.MouseEvent("mouseleave"));
        launched = [];
        out.querySelector(".wv-pp-wtitle").click();
        assert.deepEqual(launched, ["https://doi.org/10.1016/j.jcp.2026.115533"], "a paper you lack: its DOI page");
        w("W7202196426").querySelector(".wv-pp-wtitle").click();
        assert.ok(await wvT.waitFor(() => win.ZoteroPane.getSelectedItems().map(i => i.id).join() === String(A.id), 8000, 50), "a click: the item in the library");
    });

    it("publications: find, sort, and Weavero's funnel -- In your library, Type, Journal, Decade, a click includes, Alt+click excludes -- the list redrawn in place, the search field keeping the focus", async function () {
        // MJT 2026-11-25: "For the publications part, add some sorting and filtering options";
        // "The filters should follow the Weavero filters design, with the Alt+Click option to exclude".
        const rec = recOf("Sauret");
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        const w = (id) => q("[data-wv-pp-works='openalex'] [data-wv-pp-work='" + id + "']");
        assert.ok(await wvT.waitFor(() => w("W7202196426") && q("[data-wv-pp-wsearch]"), 20000, 100));
        const shown = () => Array.from(root().querySelectorAll("[data-wv-pp-works='openalex'] [data-wv-pp-work]")).map(r => r.getAttribute("data-wv-pp-work"));
        assert.equal(Number(q(".wv-pp-wlist").getAttribute("data-wv-pp-wshown")), 20, "every work of the fixture");
        // The search: words in the title, the authors, the journal or the DOI, in any order.
        const field = q("[data-wv-pp-wsearch]");
        field.focus();
        field.value = "fibre drops";
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.deepEqual(shown(), ["W7202196426"], "found by its title's words");
        assert.strictEqual(doc.activeElement, field, "the field keeps the focus: the list alone is redrawn");
        field.value = "computational";
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.deepEqual(shown(), ["W4407500954"], "found by its journal");
        field.value = "";
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.equal(shown().length, 20);
        // Sort: its menu (each item's command, as a click on it runs).
        const sortBy = async (value) => {
            q("[data-wv-pp-wsort='true']").click();
            const pop = await wvT.waitFor(() => doc.getElementById("wv-pp-wsort-menu"), 5000, 50);
            assert.ok(pop, "the sort menu");
            pop.querySelector("menuitem[data-wv-pp-wsort='" + value + "']").doCommand();
            try { pop.hidePopup(); } catch (e) {}
            await sleep(100);
        };
        const years = () => Array.from(root().querySelectorAll("[data-wv-pp-works='openalex'] .wv-pp-wyear")).map(y => Number(y.textContent));
        await sortBy("old");
        assert.deepEqual(years(), years().slice().sort((a, b) => a - b), "oldest first");
        assert.isBelow(years()[0], 2026);
        await sortBy("new");
        assert.deepEqual(years(), years().slice().sort((a, b) => b - a), "newest first");
        // The funnel: Weavero's filter popup, its tri-state tiles.
        const funnel = q("[data-wv-pp-wfunnel]");
        assert.ok(funnel, "the funnel");
        funnel.click();
        const pop = await wvT.waitFor(() => doc.getElementById("wv-pp-wfilter-popup"), 5000, 50);
        assert.ok(pop, "the funnel's popup");
        assert.equal(pop.querySelector(".wv-filter-top-hint").textContent, "Alt+click to exclude");
        const tile = (key, value) => pop.querySelector("[data-wv-pp-wfkey='" + key + "'][data-wv-pp-wfval='" + value + "']");
        const click = (key, value, alt) => tile(key, value).dispatchEvent(new win.MouseEvent("click", { bubbles: true, altKey: !!alt }));
        // The References' marks as tiles: blue dot (in your library, no PDF) and grey ring; no green dot
        // tile, no paper has a PDF here.
        assert.isNull(tile("kind", "pdf"), "a kind no paper has: no tile");
        assert.equal(tile("kind", "nopdf").querySelector(".wv-pp-fn").textContent, "1", "in your library: its count");
        assert.equal(tile("kind", "web").querySelector(".wv-pp-fn").textContent, "19");
        assert.equal(tile("kind", "nopdf").querySelector(".wv-pp-fmark").getAttribute("data-wv-refs-kind"), "nopdf", "the tile's mark");
        click("kind", "nopdf");
        assert.deepEqual(shown(), ["W7202196426"], "In your library");
        assert.equal(tile("kind", "nopdf").dataset.selected, "true", "the tile included");
        assert.isTrue(funnel.classList.contains("wv-pp-funnel-active"), "the funnel's dot");
        click("kind", "nopdf", true);
        assert.equal(shown().length, 19, "Alt+click: the papers you lack");
        assert.equal(tile("kind", "nopdf").dataset.excluded, "true", "the tile excluded");
        click("kind", "nopdf", true);
        assert.equal(shown().length, 20, "Alt+click again: cleared");
        assert.isFalse(funnel.classList.contains("wv-pp-funnel-active"), "no dot");
        assert.equal(tile("type", "preprint").querySelector(".icon-item-type").getAttribute("data-item-type"), "preprint", "a type's tile: Zotero's icon");
        click("type", "preprint");
        assert.deepEqual(shown(), ["W7220380485"], "the preprints alone");
        click("type", "preprint");
        click("type", "preprint", true);
        assert.equal(shown().length, 19, "Alt+click: every work but the preprints");
        assert.notInclude(shown(), "W7220380485");
        click("type", "preprint", true);
        click("venue", "Soft Matter");
        assert.deepEqual(shown(), ["W7202196426"], "one journal");
        click("type", "preprint");
        assert.deepEqual(shown(), [], "every section must hold (AND): a Soft Matter preprint, none");
        assert.isNull(pop.querySelector("[data-wv-pp-fsec='decade']"), "one decade only (2020s): no Decade section");
        pop.querySelector("[data-wv-pp-wfclear]").click();
        assert.equal(shown().length, 20, "Clear");
        // Escape closes it, the funnel gets the focus back.
        pop.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        assert.ok(await wvT.waitFor(() => !doc.getElementById("wv-pp-wfilter-popup"), 3000, 50), "closed");
    });

    it("Build from followed authors: a record per author (To check, followed), the ones there already only marked followed; the lookups one at a time with progress, and Stop", async function () {
        wv._wvPeopleTabOpen(win, {});
        const doc0 = { format: "alerts/1", followed_authors: [
            { name: "Alban Sauret", openalex: ["A5030022491"], confidence: "high", enabled: true },
            { name: "Detlef Lohse", openalex: ["A5066010665"], confidence: "high", enabled: true },
            { name: "Ann Buildone", openalex: ["A5000000001"], confidence: "medium", enabled: true },
            { name: "Ben Buildtwo", openalex: ["A5000000002"], confidence: "low", enabled: true },
            { name: "Cy Buildthree", openalex: ["A5000000003"], confidence: "low", enabled: true },
            { name: "Dee Nameonly", openalex: [], enabled: true },
        ] };
        over.slow = 150;
        calls.length = 0;
        let r;
        try {
            r = await wv._wvPeopleBuild(doc0);
            assert.deepEqual([r.added, r.followed, r.queued], [4, 2, 3], "four new, two already there now followed, three with an id to look up");
            assert.ok(await wvT.waitFor(() => q("[data-wv-pp-build='running']"), 3000, 20), "the progress line");
            assert.ok(q("[data-wv-pp-act='build-stop']"), "Stop");
            q("[data-wv-pp-act='build-stop']").click();
            assert.ok(await wvT.waitFor(() => wv._wvPpBuild && !wv._wvPpBuild.running, 15000, 50), "stopped");
            assert.isBelow(wv._wvPpBuild.done, 3, "before every lookup was done");
        }
        finally { over.slow = 0; }
        const one = recOf("Buildone");
        assert.ok(one && one.check && one.followed, "a new record: To check, followed");
        assert.deepEqual(linesOf(one, "openalex").map(l => [l.value, l.source]), [["A5000000001", "radar"]], "the alerts file's id, its source named (the stored key stays \"radar\")");
        assert.equal(linesOf(recOf("Nameonly"), "openalex").length, 0, "a name alone: no id, nothing fetched for it");
        assert.isFalse(calls.some(c => /Nameonly/.test(c)), "never searched by its name");
        assert.isTrue(recOf("Sauret").followed && recOf("Lohse").followed, "the ones there already: followed");
        assert.equal(wv._wvPeopleAllSync().filter(p => p.last === "Sauret").length, 1, "never twice");
        // A second Build adds nothing.
        const r2 = await wv._wvPeopleBuild(doc0);
        assert.deepEqual([r2.added, r2.followed], [0, 0]);
        if (wv._wvPpBuild) wv._wvPpBuild.stop = true;
        assert.strictEqual(await counts(), libCounts, "nothing in any library");
        // The left pane's views count them (the Google Contacts design, step 2).
        wv._wvPeopleTabRender(win);
        const n = (k) => Number(q("[data-wv-pp-nav='" + k + "'] .wv-pp-navn").textContent);
        assert.equal(n("all"), wv._wvPeopleAllSync().length);
        assert.equal(n("followed"), wv._wvPeopleAllSync().filter(p => p.followed).length);
        q("[data-wv-pp-nav='followed']").click();
        assert.ok(await wvT.waitFor(() => wv._wvPeopleTableIds(win).length === n("followed"), 5000, 50), "the view Followed lists them: " + wv._wvPeopleTableIds(win).length);
        wv._wvPeopleSetShow(win, "all");
        // The source chip of a value from the alerts file: the interface's words
        // (weavero-people-source-radar), as for "you" and "your items".
        wv._wvPeopleTabOpen(win, { personID: one.id, edit: true });
        const chipOf = () => { const r = valRow("openalex", "A5000000001"); return r ? r.querySelector(".wv-pp-src[data-source='radar']") : null; };
        assert.ok(await wvT.waitFor(() => chipOf(), 5000, 50), "the id's row, with its source chip");
        assert.equal(chipOf().textContent.trim(), "alerts file", "the chip names the alerts file");
    });
});
