const cron = require("node-cron");
const express = require("express");
const puppeteer = require('puppeteer');
const axios = require('axios');

app = express();

// Setar um tempo para  apagina demorra a fechar, não é necessario
async function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapping() {
  const browser = await puppeteer.launch( {executablePath: '/usr/bin/chromium-browser', headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"]} );
  // const browser = await puppeteer.launch( {headless: false} );
  const page = await browser.newPage(); // Abrindo uma pagina
  await page.goto('https://www.citius.mj.pt/portal/consultas/consultascire.aspx'); // Qual pagina deve acessar
  // await timeout(8000);
  // await page.screenshot({path: 'teste.png', fullPage: true});
  // await page.pdf({path: 'hn.pdf', format: 'A4'});

  await page.$eval('#ctl00_ContentPlaceHolder1_txtCalendarDesde', el => {
    var data = new Date();
    var dia = String(data.getDate()).padStart(2, '0');
    var mes = String(data.getMonth() + 1).padStart(2, '0');
    var ano = data.getFullYear();
    var dataAtual = dia + '-' + mes + '-' + ano;

    el.value = dataAtual
  });
  await page.$eval('#ctl00_ContentPlaceHolder1_txtCalendarAte', el => {
    var data = new Date();
    var dia = String(data.getDate()).padStart(2, '0');
    var mes = String(data.getMonth() + 1).padStart(2, '0');
    var ano = data.getFullYear();
    var dataAtual = dia + '-' + mes + '-' + ano;
    
    el.value = dataAtual
  });
  await page.$eval('#ctl00_ContentPlaceHolder1_ddlGrupoActos', el => {
    el.value = '20'
  });
  await page.$eval('#ctl00_ContentPlaceHolder1_ddlActos', el => {
    el.value = 'Pub. - Sentença Declaração Insolvência'
  });

  // Pegando p botão do evento
  const dar1 = await page.$('.submit');
  // Clicando no botão
  await dar1.click();

  // Esperamos o resultado
  await page.waitForSelector('.resultadocdital');

  let currentPage = 1; // Infomramos que esta na primeira pagina
  // verificando quantas pagians existem
  let pagesToScrape = await page.evaluate(() => Math.ceil(document.querySelector('#divresultadocdital').querySelectorAll('div')[0].textContent.trim().split(' ')[0]/10));
  let dados = []; // Um novo array para os dados
  // Lendo os dados por pagina
  while(currentPage <= pagesToScrape){
    // Fazemos uma leitura na pagina para recuperar os dados
    let dadosTemp = await page.evaluate(async() => {
      var nodeList = [];
      var innerHTML = [];

      // Pegando os dados
      nodeList = document.querySelector('#ctl00_ContentPlaceHolder1_upResultados').querySelectorAll('.resultadocdital');

      // Lendo o node para formatar os dados
      for(var i=0; i<nodeList.length; i++){
        // Link do docuemnto
        var document_ins = 'https://www.citius.mj.pt/portal/consultas/Viewer/DocumentoPDF.ashx?q='+nodeList[i].querySelector('#queryString').value;
  
        var nodesList = nodeList[i].childNodes; // Nova variavel para ser recuperada
        var list = []; // Criando um array de lista para adicionar os dados corretos
        var limit = 0; // Especidifco para limitar uma função
        var keyTemp = ''; // Criando uma chave especifica mas variada
        // Um novo for para pegar os dados dentro do html selecionado
        for(var ii=1; ii<nodesList.length; ii++){
          // Limpando os espaçops da frente e atras, pegando somente os dados que contem strings
          if(nodesList[ii].textContent.trim() !== ''){
            // Pegando o texto mas somente os que tem menos de 120 chars
            if(nodesList[ii].textContent.trim().length <= 120){
              limit++;
  
              if(limit == 1){
                keyTemp = (nodesList[ii].textContent.trim().toLowerCase().replace(':','')).replaceAll(' ','_');
              }else if(limit == 2){
                list.push({[keyTemp]: nodesList[ii].textContent.trim()});
                limit = 0;
                keyTemp = '';
              }
            }else{
              var list2 = []; // Criando um array de lista para adicionar os dados corretos
              var limit2 = 0; // Especidifco para limitar uma função
              var keyTemp2 = ''; // Criando uma chave especifica mas variada
              if(nodesList[ii].childNodes){
                var nodesList2 = nodesList[ii].childNodes; // Criando um nova variavel para não ficar comprida
                // Fazendo um for no html
                for(var n=0; n < nodesList2.length; n++){
                  // Esse for serve para pegar o conteudo correto do for anterior
                  for(var nn=0; nn < nodesList2[n].childNodes.length; nn++){
                    if(nodesList2[n].childNodes[nn].textContent.trim() !== ''){
                      limit2++;
  
                      if(limit2 == 1){
                        keyTemp2 = (nodesList2[n].childNodes[nn].textContent.trim().toLowerCase().replace(':','')).replaceAll(' ','_').replaceAll('/','_');
                      }else if(limit2 == 2){
                        if(keyTemp2 !== 'ver_mais'){
                          list2.push({[keyTemp2]: nodesList2[n].childNodes[nn].textContent.trim()});
                          limit2 = 0;
                          keyTemp2 = '';
                        }
                      }
                    }
                  }
                }
  
                if(list2.length > 0){
                  list.push({'insolventes': list2});
                  // console.log(list2);
                }
              }
            }
          }
        }
        list.push({document_ins});
        innerHTML.push(list);
      }

      return innerHTML;
    });
    dados = dados.concat(dadosTemp); // Setando os dados em array
    // Indo para proxima pagina
    if (currentPage < pagesToScrape) {
      await Promise.all([
        await page.evaluateHandle(() => document.querySelector('#ctl00_ContentPlaceHolder1_Pager1_btnNextPage').click()),
          await page.evaluate(() => document.querySelector('#ctl00_ContentPlaceHolder1_divResultados').innerHTML = ' '),
          await page.waitForSelector('.resultadocdital')
      ]);
    }
    currentPage++;
  }

  // console.log(dados);
  axios.post('http://159.89.36.106/citius/scraping', dados).then(res => {
    // console.log(res);
  }).catch(error => {
    console.error(error)
  });

  // await page.screenshot({path: 'teste.png', fullPage: true});

  await browser.close();
}

// scrapping();

cron.schedule("*/3 * * * *", () => scrapping());

app.listen(1313);