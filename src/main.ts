import axios from 'axios';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import fs from 'fs';
import path from 'path';
import CryptoJS from 'crypto-js';

// acciotest.json
/*
{
  'testRepo': string',
  'pathToFile': 'string'
}
*/

const ignoreFile = [
  '.git',
  '.gitignore',
  'node_modules',
  'package-lock.json',
  'package.json',
  'encrypted',
  '.acciotest.json',
  'test.yml',
  '.cypress.json'
];
const permanentIgnore = ['node_modules', '.git', 'encrypted'];

async function decrypt(
  path: string,
  parentDirectory: string,
  childDirectory: string
) {
  try {
    const dir = await fs.promises.opendir(`${path}/${childDirectory}`);
    const newFilePath = `${path}/${parentDirectory}/${childDirectory}`;

    for await (const dirent of dir) {
      if (dirent.name === parentDirectory) {
        continue;
      } else if (!ignoreFile.includes(dirent.name) && dirent.isDirectory()) {
        decrypt(path, parentDirectory, `${childDirectory}/${dirent.name}`);
      } else if (!ignoreFile.includes(dirent.name) && !dirent.isDirectory()) {
        let content = fs
          .readFileSync(`${path}/${childDirectory}/${dirent.name}`)
          .toString();
        var bytes = CryptoJS.AES.decrypt(content, 'piyush<3rajat');
        var originalText = bytes.toString(CryptoJS.enc.Utf8);
        var stream = fs.createWriteStream(`${newFilePath}/${dirent.name}`);
        stream.write(originalText);
      } else if (!permanentIgnore.includes(dirent.name)) {
        fs.copyFileSync(
          `${path}/${childDirectory}/${dirent.name}`,
          `${newFilePath}/${dirent.name}`
        );
      }
    }
    return;
  } catch (error) {
    console.log(error);
  }
}

async function run(): Promise<void> {
  const ACCIO_API_ENDPOINT = process.env['ACCIOJOB_BACKEND_URL'];
  const githubRepo = process.env['GITHUB_REPOSITORY'];
  const repoWorkSpace: string | undefined = process.env['GITHUB_WORKSPACE'];
  let studentUserName = '';
  let assignmentName = '';
  let questionTypeContent = '';
  try {
    if (!githubRepo) throw new Error('No GITHUB_REPOSITORY');

    const [repoOwner, repoName] = githubRepo.split('/');
    let token = process.env['ACCIO_ASGMNT_ACTION_TOKEN'];

    if (!token) throw new Error('No token given!');
    if (!repoWorkSpace) throw new Error('No GITHUB_WORKSPACE');
    if (repoOwner !== 'acciojob') throw new Error('Error not under acciojob');
    if (!repoName) throw new Error('Failed to parse repoName');

    const contextPayload = github.context.payload;

    if (contextPayload.pusher.username) {
      if (repoName.includes(contextPayload.pusher.username)) {
        const indexOfStudentName = repoName.indexOf(
          contextPayload.pusher.username
        );
        studentUserName = repoName.substring(indexOfStudentName);
        assignmentName = repoName.substring(0, indexOfStudentName - 1);
      }
    } else if (repoName.includes(contextPayload.pusher.name)) {
      const indexOfStudentName = repoName.indexOf(contextPayload.pusher.name);
      studentUserName = repoName.substring(indexOfStudentName);
      assignmentName = repoName.substring(0, indexOfStudentName - 1);
    }

    process.stdout.write(
      `repoWorkSpace = ${repoWorkSpace}\nrepoName = ${repoName}\nstudentName = ${studentUserName}\nassignmentName = ${assignmentName}\n`
    );

    process.stdout.write(
      `Pusher Username = ${contextPayload.pusher.username}\nPusher Name = ${contextPayload.pusher.name}`
    );

    if (assignmentName && studentUserName) {
      const questionTypeQuery = new URLSearchParams();

      questionTypeQuery.append('templateName', assignmentName);
      const questionTypeData = await axios.get(
        `${ACCIO_API_ENDPOINT}/github/get-question-type?${questionTypeQuery.toString()}`
      );
      questionTypeContent = questionTypeData.data;

      process.stdout.write(`question type = ${questionTypeContent}\n`);

      const accioTestConfigData = fs.readFileSync(
        path.resolve(repoWorkSpace, 'acciotest.json')
      );

      const accioTestConfig = JSON.parse(accioTestConfigData.toString());

      const query = new URLSearchParams();
      query.append('repo', accioTestConfig.testRepo);
      query.append('filePath', accioTestConfig.pathToFile);
      query.append('token', token);

      // Get the encoded test file contents
      const encodedTestFileData = await axios.get(
        `${ACCIO_API_ENDPOINT}/github/action-get-file?${query.toString()}`
      );

      const testFileContent = Buffer.from(
        encodedTestFileData.data,
        'base64'
      ).toString('utf8');

      let junitReports;

      if (questionTypeContent == 'CONTEST') {
        await decrypt(repoWorkSpace + '/encrypted', '', '');
        const encryptedRepoWorkSpace = repoWorkSpace + '/encrypted';
        fs.mkdirSync(
          path.resolve(encryptedRepoWorkSpace, 'src/test/java/com/driver/test'),
          {
            recursive: true
          }
        );

        fs.writeFileSync(
          path.resolve(
            encryptedRepoWorkSpace,
            'src/test/java/com/driver/test/TestCases.java'
          ),
          testFileContent
        );
        await exec.exec('mvn install', undefined, {
          cwd: encryptedRepoWorkSpace
        });
        junitReports = fs.readFileSync(
          path.resolve(
            encryptedRepoWorkSpace,
            'target/surefire-reports/com.driver.test.TestCases.txt'
          )
        );
      } else {
        fs.mkdirSync(
          path.resolve(repoWorkSpace, 'src/test/java/com/driver/test'),
          {
            recursive: true
          }
        );

        fs.writeFileSync(
          path.resolve(
            repoWorkSpace,
            'src/test/java/com/driver/test/TestCases.java'
          ),
          testFileContent
        );
        await exec.exec('mvn install', undefined, {
          cwd: repoWorkSpace
        });
        junitReports = fs.readFileSync(
          path.resolve(
            repoWorkSpace,
            'target/surefire-reports/com.driver.test.TestCases.txt'
          )
        );
      }

      let junitString = junitReports.toString();
      junitString = junitString.split('\n')[3];
      process.stderr.write(`\n${junitString}`);
      let testResult = junitString.replace(/[^0-9.]/g, ' ').split(' ');
      testResult = testResult.filter(element => !['.', ''].includes(element));

      process.stdout.write(`\nTotal Test Cases: ${parseInt(testResult[0])}`);
      process.stdout.write(`\nFailed Test Cases: ${parseInt(testResult[1])}`);

      process.stdout.write(`\nEvaluating score...\n`);

      const totalTests = parseInt(testResult[0]);
      const errorCases = parseInt(testResult[2]) ? parseInt(testResult[2]) : 0;
      const totalPassed =
        parseInt(testResult[0]) - parseInt(testResult[1]) - errorCases;

      let testResults = {
        totalTests,
        totalPassed
      };

      // process.stdout.write(`\n${token}`);
      process.stdout.write(`\n${testResults}`);
      process.stdout.write(`\n${assignmentName}`);
      process.stdout.write(`\n${repoName}`);
      process.stdout.write(`\n${studentUserName}`);

      const response: any = await axios.post(
        `${ACCIO_API_ENDPOINT}/github/get-score`,
        {
          token,
          testResults,
          assignmentName,
          repoName,
          studentGithubUserName: studentUserName
        }
      );

      process.stdout.write(`\nScore: ${response.data['scoreReceived']}`);
      process.exit(0);
    }
  } catch (error) {
    if (repoWorkSpace && githubRepo && assignmentName && studentUserName) {
      let token = process.env['ACCIO_ASGMNT_ACTION_TOKEN'];
      const [repoOwner, repoName] = githubRepo.split('/');
      let junitReports;
      if (questionTypeContent == 'CONTEST') {
        junitReports = fs.readFileSync(
          path.resolve(
            repoWorkSpace + '/encrypted',
            'target/surefire-reports/com.driver.test.TestCases.txt'
          )
        );
      }

      junitReports = fs.readFileSync(
        path.resolve(
          repoWorkSpace,
          'target/surefire-reports/com.driver.test.TestCases.txt'
        )
      );
      let junitString = junitReports.toString();
      junitString = junitString.split('\n')[3];
      process.stderr.write(`\n${junitString}`);
      let testResult = junitString.replace(/[^0-9.]/g, ' ').split(' ');
      testResult = testResult.filter(element => !['.', ''].includes(element));

      process.stdout.write(`\nTotal Test Cases: ${parseInt(testResult[0])}`);
      process.stdout.write(`\nFailed Test Cases: ${parseInt(testResult[1])}`);

      process.stdout.write(`\nEvaluating score...\n`);

      const totalTests = parseInt(testResult[0]);
      const errorCases = parseInt(testResult[2]) ? parseInt(testResult[2]) : 0;
      const totalPassed =
        parseInt(testResult[0]) - parseInt(testResult[1]) - errorCases;

      let testResults = {
        totalTests,
        totalPassed
      };

      process.stdout.write(`\n${testResults}`);
      process.stdout.write(`\n${assignmentName}`);
      process.stdout.write(`\n${repoName}`);
      process.stdout.write(`\n${studentUserName}`);

      const response: any = await axios.post(
        `${ACCIO_API_ENDPOINT}/github/get-score`,
        {
          token,
          testResults,
          assignmentName,
          repoName,
          studentGithubUserName: studentUserName
        }
      );

      process.stdout.write(`\nScore: ${response.data['scoreReceived']}`);
    }
    if (error instanceof Error) core.setFailed(error.message);
    process.stderr.write(`\nError: ${(error as Error).message}`);
    process.exit(1);
  }
}

run();
