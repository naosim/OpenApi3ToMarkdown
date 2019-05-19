
const OpenApi3ToMarkdown = (function() {

  /**
   * 
   * @param {any} rootObj 
   * @param { function(rootObj):any } cb 
   * @returns cbで取得した値。cbで例外が発生した場合、undefinedを返す
   */
  function find(rootObj, cb) {
    try {
      return cb(rootObj)
    } catch {
      return undefined;
    }
  }
  
  /**
   * $refを破壊的に展開する
   */
  function expandRefs(swagger) {
    var components = swagger.components;
    var result = {};
  
    const prefix = '#/components'
  
    const types = [
      'schemas', 
      'responses', 
      'parameters', 
      'examples', 
      'requestBodies', 
      'headers', 
      'securitySchemes', 
      'links', 
      'callbacks'
    ];
    types.forEach(type => {
      if(!components[type]) {
        return;
      }
      Object.keys(components[type]).forEach(key => {
        result[`${prefix}/${type}/${key}`] = components[type][key];
      })
    })
  
    function expandRefs(obj, componentsMap, parent, parentKey) {
      if(typeof obj !== 'object') {
        return;
      }
      Object.keys(obj).forEach(key => {
        if(key === '$ref') {
          parent[parentKey] = componentsMap[obj[key]];
          // console.log('find!', obj[key]);
          
        } else {
          expandRefs(obj[key], componentsMap, obj, key);
        }
      })
    }
  
    // コンポーネント内を展開
    while(JSON.stringify(swagger).indexOf('$ref') != -1) {
      console.log('FIND!');
      expandRefs(swagger, result);
    }
  }

  function createDescription(obj) {
    var result = []
    if(obj.description !== undefined) {
      result.push(obj.description);
    }

    var range = '値'
    if(obj.minimum !== undefined) {
      range = obj.minimum + ' ' + (obj.exclusiveMinimum ? '<' : '<=') + ' ' + range
    }
    if(obj.maximum !== undefined) {
      range = range + ' ' + (obj.exclusiveMaximum ? '<' : '<=') + ' ' + obj.maximum
    }
    if(range !== '値') {
      result.push(range);
    }

    [
      {key: 'maxLength', jp: '最大長'},
      {key: 'minLength', jp: '最小長'},
      {key: 'pattern', jp: 'パタン'},
    ].filter(v => obj[v.key] !== undefined).map(v => `${v.jp}: \`${obj[v.key]}\``).forEach(v => result.push(v))

    if(obj.enum !== undefined) {
      result.push(`enum: ${obj.enum.join(', ')}`);
    }

    if(obj.example !== undefined && obj.enum === undefined) {
      result.push(`例: ${obj.example}`);
    }

    return result.length > 0 ? `<ul><li>${result.join('</li><li>')}</li></ul>` : '';
    // return result.join('<br>');
  }
  
  /**
   * JSONオブジェクトをテーブルに変換する
   */
  function jsonObj2Table(obj, upper, text, required, ignoreType) {
    //console.log(text === undefined, upper, text);
    if(text === undefined) {
      text = 'パス | 型 | 必須 | 和名 | 説明\n';
      text += '---|---|---|---|---\n';
    }
    if(upper === undefined) {
      upper = '$'
    }
    if(required === undefined) {
      required = []
    }
    
    const key = upper.split('.').reduce((memo, v) => v, '');
    
    if(ignoreType) {
      text += `\`${upper}\` | ${key == '\$' || required.filter(v => v == key).length > 0 ? 'o' : ''} | ${obj.title || ''} | ${createDescription(obj)}\n`;
    } else {
      text += `\`${upper}\` | ${obj.type} | ${key == '\$' || required.filter(v => v == key).length > 0 ? 'o' : ''} | ${obj.title || ''} | ${createDescription(obj)}\n`;
    }
    if(obj.type == 'object') {
      text = Object.keys(obj.properties).reduce((memo, key) => {
        return jsonObj2Table(obj.properties[key], `${upper}.${key}`, memo, obj.required);
      }, text)
    } else if(obj.type == 'array') {
      text = jsonObj2Table(obj.items, `${upper}[n]`, text);
    }
    
    return text;
  }
  function jsonObj2Example(obj) {
    function jsonObj2ExampleObj(obj) {
      if(obj.type == 'object') {
        return Object.keys(obj.properties).reduce((memo, key) => {
          memo[key] = jsonObj2ExampleObj(obj.properties[key]);
          return memo;
        }, {})
      } else if(obj.type == 'array') {
        return [jsonObj2ExampleObj(obj.items)];
      } else {
        console.log(obj);
        return obj.example || obj.type || '';
      }
    }
  
    var obj = jsonObj2ExampleObj(obj);
    return JSON.stringify(obj, null, '  ')
  }
  
  
  function formProperties2Table(obj) {
    var text = 'キー | 必須 | 和名 | 説明\n'; 
    text += '---|---|---|---\n';
    return Object.keys(obj.properties).reduce((memo, key) => {
      return jsonObj2Table(obj.properties[key], `${key}`, memo, obj.required, true);
    }, text)
  }
  
  return {
    "convert": function(swaggerText) {
      var swagger = jsyaml.load(swaggerText);
      expandRefs(swagger);
      
      var output = '';
    
      // タイトル
      output += `# ${swagger.info.title}  \n`
      output += `${swagger.info.description}  \n`
    
      // 外部ドキュメント
      if(swagger.externalDocs) {
        output += `## 外部ドキュメント\n`
        output += `[${swagger.externalDocs.description}](${swagger.externalDocs.url})  \n\n`
      }
    
      // サーバ
      if(swagger.servers) {
        output += `## サーバ\n`
        swagger.servers.forEach(v => {
          output += `${v.url}  \n${v.description}\n\n`
        })
        
      }
    
      // paths
      output += `## PATH\n`
      output += Object.keys(swagger.paths).map(path => {
        return Object.keys(swagger.paths[path]).map(method => {
          const obj = swagger.paths[path][method]
          var output = `### ${method.toUpperCase()} ${path} ${obj.summary}\n`
    
          if(obj.description) {
            output += `${obj.description}\n\n`
          }
    
          if(obj.tags) {
            output += `tags: ${obj.tags.join(', ')}\n\n`
          }
    
          var formSchema = find(obj ,v => v.requestBody.content['application/x-www-form-urlencoded'].schema);
          if(formSchema !== undefined) {
            output += `#### リクエスト\n`
            output += `application/x-www-form-urlencoded  \n\n`

            output += formProperties2Table(formSchema);
            output += '\n\n'
          }

          var jsonSchema = find(obj ,v => v.requestBody.content['application/json'].schema);
          if(jsonSchema !== undefined) {
            output += `#### リクエスト\n`
            output += 'application/json\n\n'
            output += jsonObj2Table(jsonSchema)
            output += '\n'
            output += '```\n'
            output += jsonObj2Example(jsonSchema);
            output += '\n'
            output += '```\n'
          }

          output += `#### レスポンス\n`
          output += Object.keys(obj.responses).map(res => {
            var o = `##### ${res}\n`;
            o += `${obj.responses[res].description}  \n`
            let schema = find(obj.responses[res], (v)=> v.content['application/json'].schema)
            if(schema !== undefined) {
              o += 'application/json\n\n'
              o += jsonObj2Table(schema)
              o += '\n'
              o += '```\n'
              o += jsonObj2Example(schema);
              o += '\n'
              o += '```\n'
            }
            o += `\n`
            return o;
            
          }).join('\n')
    
          return output;
        }).join('')
      }).join('')
    
      // ネストを1つあげる
      output = output.split('## ').join('# ');

      return output;
    }
  }
})();

