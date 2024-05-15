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
    if (svg.style) {
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
      styleMap.forEach(({ key, value }) => {
        const elements = svg[key];
        if (elements) {
          elements.forEach(el => {
            el.$[value.attrName] = value.attrValue;
            delete el.$['class'];
          });
        }
      });

      delete svg.style;
    }

    // Remove unnecessary tags
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
    // Remove comment nodes
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
	if ((!svg.$.width || !svg.$.height ) && svg.$.viewBox){
		const viewBoxValues = svg.$.viewBox.split(' ');
		svg.$.width = viewBoxValues[2] - viewBoxValues[0];
		svg.$.height = viewBoxValues[3] - viewBoxValues[1];
	} else {
		svg.$.width = 1200;
		svg.$.height = 1200;
	}
	
	// Remove attributes
	if(svg.$.id){
		svg.$.id = null;
	}
	if(svg.$.xmlns){
		svg.$.xmlns = null;
	}
	if(svg.$.viewBox){
		svg.$.viewBox = null;
	}
	
    if (svg.path) {
		
      svg.path.forEach((path, index) => {
		//get path fill color (style="fill:#75bae7;")
		const styleElements = path.$?.style?.split(';') ?? []; // fill:#75bae7
		const fillElement = styleElements.filter((elem) => elem.includes('fill:'))[0] ?? ''; // fill:#75bae7
		const fillColor = fillElement.replace('fill:#', ''); // 75bae7
		//console.log(`style data is ${path.$?.style} Style elements is ${styleElements} fill color is ${fillColor}`);  
        path.$.id = `${index + 1}`;
        console.log(`Added id="${index + 1}" attribute to <path> tag`);

		// If color is white, then set it to almost white (developer requirement!)
        if (fillColor === 'white' || fillColor === '#FFFFFF') {
          console.log('Changing color attribute to #FFFFFE for <path> tag');
		  const newStyle = styleElements.filter((elem) => !elem.includes('fill:')).join(';') + ';fill:#FFFFFE';
        }

		// All strokes must be black only (developer requirement!)
        if (path.$.stroke) {
          console.log('Set stroke="black" attribute for <path> tag');
          path.$.stroke = 'black';
        }
		
		// If fill is almost black then set it to black
		if(!Number.isNaN(parseInt(fillColor,16))){
			//console.log(`color blackness: ${parseInt(fillColor,16)} - ${(16777215 - parseInt(fillColor,16))/16777215} %`);
			if((16777215 - parseInt(fillColor,16))/16777215 > 0.94){
				console.log(`Setting fill color from ${fillColor} to full black`);
				const newStyle = styleElements.filter((elem) => !elem.includes('fill:')).join(';') + ';fill:#000000';
				
			}  // #040404 = 16514043
		}
		
		

        const classValue = path.$.class;
        if (classValue) {
          const style = styleMap?.find(({ key }) => key === classValue.trim());
          if (style) {
            console.log(`Added ${style.value.attrName}="${style.value.attrValue}" attribute to <path> tag with class ${classValue}`);
            path.$[style.value.attrName] = style.value.attrValue;
          }
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