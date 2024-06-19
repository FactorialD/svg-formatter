const fs = require('fs');
const xml2js = require('xml2js');

const resultFolder = 'output';
const inputFolder = 'input';

// Function to minimize SVG file
function minimizeSVG(svgContent, file) {
  const parser = new xml2js.Parser({ trim: true, preserveChildrenOrder: true });
  const builder = new xml2js.Builder({
    headless: true,
    renderOpts: { pretty: true },
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    rootName: 'svg',
    renderNodeDescriptors: { svg: { xmlns: 'http://www.w3.org/2000/svg' } }
  });

  parser.parseString(svgContent, (err, result) => {
    if (err) {
      console.error('Error parsing XML:', err);
      return;
    }

    const svg = result.svg;
	let styleMap = null;
    // Handle <style> tag
	// Записує всі стилі в мапу
    if (svg?.style) {
      const styles = svg.style[0].trim().split('}');
      styleMap = styles.map(style => {
        const [key, value] = style.trim().split('{');
        if (key && value) {
          const [attrName, attrValue] = value.split(':');
          return { key: key.trim(), value: { attrName: attrName.trim(), attrValue: attrValue.trim() } };
        }
        return null;
      }).filter(Boolean);

      console.log('Obtained style map:', styleMap);

      // Apply styles to corresponding elements
	  //І потім записує значення стилю до потрібних елементів
      styleMap.forEach(({ key, value }) => {
        const elements = svg[key];
        if (elements) {
          elements.forEach(el => {
            el.$[value.attrName] = value.attrValue;
            delete el.$['class'];
          });
        }
      });

		//після чого видаляє таблицю стилів
      delete svg.style;
    }

    // Видаляємо непотрібні теги
    const unnecessaryTags = ['xml', 'g', '?xml','!DOCTYPE'];
    unnecessaryTags.forEach(tag => {
      if (svg[tag]) {
        const elements = svg[tag];
        elements.forEach(el => {
          const children = el[Object.keys(el)[0]] || [];
          delete svg[tag];
          svg = { ...svg, ...children };
        });
        console.log(`Removed ${tag} tags`);
      }
    });

	const comments = [];
    // Видаляємо коментарі
    function removeCommentNodes(node) {
		if (typeof node === 'string') {
			const trimmedNode = node.trim();
		if (trimmedNode.startsWith('<!--') && trimmedNode.endsWith('-->')) {
			comments.push(trimmedNode);
		}
		} else if (typeof node === 'object') {
		for (const key in node) {
			if (Array.isArray(node[key])) {
				node[key].forEach(removeCommentNodes);
			} else {
				removeCommentNodes(node[key]);
			}
		}
		}
    }
    removeCommentNodes(svg);
	console.log('Comments:', comments);
	
	// If svg hasnt witdh and height attribute, add it from attribute viewBox, else set to 1200
	if ((!svg.$?.width || !svg.$?.height ) && svg.$?.viewBox){
		const viewBoxValues = svg.$?.viewBox.split(' ');
		svg.$.width = viewBoxValues[2] - viewBoxValues[0];
		svg.$.height = viewBoxValues[3] - viewBoxValues[1];
	} else {
		svg.$.width = 1200;
		svg.$.height = 1200;
	}
	
	// Видаляємо лишні атрибути основного тегу
	if(svg.$?.id){
		svg.$.id = null;
	}
	if(svg.$?.xmlns){
		svg.$.xmlns = null;
	}
	if(svg.$?.viewBox){
		svg.$.viewBox = null;
	}
	
    if (svg?.path) {
		// обробляємо шейпи
      svg.path.forEach((path, index) => {
		// додаємо атрибут айді до шейпу
        path.$.id = `${index + 1}`;
        console.log(`Added id="${index + 1}" attribute to <path> tag`);
		  
		// якщо в шейпі є клас, то дістаємо дані про нього з мапи і записуємо в стилі шейпу 
		const classValue = path.$.class;
        if (classValue) {
          const style = styleMap?.find(({ key }) => key === classValue.trim());
          if (style) {
            console.log(`Added ${style.value.attrName}="${style.value.attrValue}" attribute to <path> tag with class ${classValue}`);
            path.$[style.value.attrName] = style.value.attrValue;
          }
        }
		  
		//Якщо шейп має атрибут стилю
		if(path.$?.style){
		  //дістаємо звідти всі стилі і записуємо їх в атрибути
		  const styleElements = path.$?.style?.split(';').map((word) => word.trim()) ?? []; // fill:#75bae7
		  styleElements.forEach((styleElement) => {
			  const [styleElementName, styleElementValue] = styleElement.split(':').map((word) => word.trim());
			  path.$.styleElementName = styleElementValue;
		  })
		  
		  // видаляємо атрибут стилю
		  path.$.style = null;
		}
		
		//Якщо в шейпі є атрибут fill
		if(path.$?.fill){
			
			let fillColor = path.$?.fill; 
			let newFillColor = path.$?.fill; 
			console.log(`current fill color: ${fillColor}`);
			// If color is white, then set it to almost white (developer requirement!)
            if (fillColor === 'white' || fillColor === '#FFFFFF') {
              console.log('Changing color attribute to #FFFFFE for <path> tag');
			  newFillColor = '#FFFFFE';
            }
			
			// If fill is almost black then set it to black
			const colorInt = parseInt(fillColor.substr(1),16);
			if(!Number.isNaN(colorInt)){
				console.log(`color blackness: ${colorInt} - ${parseInt(colorInt)/16777215} %`);
				if(colorInt/16777215 < 0.08){
					console.log(`Setting fill color from ${fillColor} to full black`);
					newFillColor = '#000000';
				
				}  // #040404 = 16514043
			}
			

			if(path.$?.fill === 'none'){
				path.$.fill = null;
			} else{
				path.$.fill = newFillColor;
			}
			
			
			
		}
		
		// All strokes must be black only (developer requirement!)
        if (path.$?.stroke) {
          console.log('Set stroke="black" attribute for <path> tag');
          path.$.stroke = 'black';
        }
		

      });
	  
	  console.log(`Path count: ${svg.path.length}`);
    }

	
    const minimizedSVG = builder.buildObject(svg);


	const outputFilePath = `${resultFolder}/result_${file}`;
	
	const imageData = JSON.stringify(minimizedSVG);
	const request = JSON.stringify({imageParts: minimizedSVG, imageCategory: 'DimaTest2', height: 1200, width: 1200, subCategories: '', createdAt: '', sort: 0});

    // Send file to backend
    // ...
	const jsonStringify = (data) => {
		try {
			fs.writeFileSync(`${outputFilePath}_request.txt`,  data)
		} catch (error) {
			console.error(error);
		}
	}

jsonStringify(request);

    // Save file to output folder
    
    fs.writeFile(outputFilePath, minimizedSVG, err => {
      if (err) {
        console.error(`Error writing file ${file}:`, err);
      } else {
        console.log(`File ${file} processed and saved successfully.`);
      }
    });
  });
}

// Read files from input folder
fs.readdir(inputFolder, (err, files) => {
  if (err) {
    console.error('Error reading folder:', err);
    return;
  }

  files.forEach(file => {
    const filePath = `${inputFolder}/${file}`;
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading file ${file}:`, err);
        return;
      }

      minimizeSVG(data, file);
    });
  });
});