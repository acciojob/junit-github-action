import axios from 'axios';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import fs from 'fs';
import path from 'path';

// acciotest.json
/*
{
  'testRepo': string',
  'pathToFile': 'string'
}
*/

async function run(): Promise<void> {
  const ACCIO_API_ENDPOINT =
      'https://accio-release-1-dot-acciojob-prod.el.r.appspot.com';
  const githubRepo = process.env['GITHUB_REPOSITORY'];
  const repoWorkSpace: string | undefined = process.env['GITHUB_WORKSPACE'];
  let studentUserName = '';
  let assignmentName = '';
  try {
    process.stderr.write(`\n1111`)
    if (!githubRepo) throw new Error('No GITHUB_REPOSITORY');

    const [repoOwner, repoName] = githubRepo.split('/');
    let token = process.env['ACCIO_ASGMNT_ACTION_TOKEN'];

    if (!token) throw new Error('No token given!');
    if (!repoWorkSpace) throw new Error('No GITHUB_WORKSPACE');
    if (repoOwner !== 'acciojob') throw new Error('Error not under acciojob');
    if (!repoName) throw new Error('Failed to parse repoName');

    const contextPayload = github.context.payload;
    process.stderr.write(`\n${githubRepo}`)
    process.stderr.write(`\n${repoOwner}`)
    process.stderr.write(`\n${repoName}`)
    process.stderr.write(`\n${contextPayload}`)
    process.stderr.write(`\n${contextPayload.pusher.name}`)
    process.stderr.write(`\n${contextPayload.pusher.username}`)

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

    process.stderr.write(`\n2222`)
    process.stderr.write(`\n${assignmentName}`)
    process.stderr.write(`\n${studentUserName}`)
    
    if (assignmentName && studentUserName) {
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

      fs.mkdirSync(path.resolve(repoWorkSpace, 'src/test/java/com/driver/test'), {
        recursive: true
      });

      fs.writeFileSync(
        path.resolve(repoWorkSpace, 'src/test/java/com/driver/test/TestCases.java'),
        testFileContent
      );

      const mvnInstall = await exec.exec('mvn install', undefined, {
        cwd: repoWorkSpace
      });

      const junitReports = fs.readFileSync(
        path.resolve(repoWorkSpace, 'target/surefire-reports/com.driver.test.TestCases.txt')
      );
      let junitString = junitReports.toString();
      junitString = junitString.split('\n')[3];
      process.stderr.write(`\n${junitString}`);
      let testResult = junitString.replace(/[^0-9.]/g,' ').split(' ');
      testResult = testResult.filter(element => !['.',''].includes(element));
      
      process.stdout.write(`\nTotal Test Cases: ${parseInt(testResult[0])}`);
      process.stdout.write(`\nFailed Test Cases: ${parseInt(testResult[1])}`);

      process.stdout.write(`\nEvaluating score...\n`);
      
      const totalTests = parseInt(testResult[0]);
      const totalPassed = (parseInt(testResult[0]) - parseInt(testResult[1]));

      let testResults = {
        totalTests,
        totalPassed,
      }
      
      // process.stdout.write(`\n${token}`);
      process.stdout.write(`\n${testResults}`);
      process.stdout.write(`\n${assignmentName}`);
      process.stdout.write(`\n${repoName}`);
      process.stdout.write(`\n${studentUserName}`);

      const {data: score} = await axios.post(
        `${ACCIO_API_ENDPOINT}/github/get-score`,
        {
          token,
          testResults,
          assignmentName,
          repoName,
          studentGithubUserName: studentUserName
        }
      );

      process.exit(0);
    }
  } catch (error) {
    if(repoWorkSpace && githubRepo && assignmentName && studentUserName){
      let token = process.env['ACCIO_ASGMNT_ACTION_TOKEN'];
      const [repoOwner, repoName] = githubRepo.split('/');

      const junitReports = fs.readFileSync(
        path.resolve(repoWorkSpace, 'target/surefire-reports/com.driver.test.TestCases.txt')
      );
      let junitString = junitReports.toString();
      junitString = junitString.split('\n')[3];
      process.stderr.write(`\n${junitString}`);
      let testResult = junitString.replace(/[^0-9.]/g,' ').split(' ');
      testResult = testResult.filter(element => !['.',''].includes(element));
      
      process.stdout.write(`\nTotal Test Cases: ${parseInt(testResult[0])}`);
      process.stdout.write(`\nFailed Test Cases: ${parseInt(testResult[1])}`);

      process.stdout.write(`\nEvaluating score...\n`);
      
      const totalTests = parseInt(testResult[0]);
      const totalPassed = (parseInt(testResult[0]) - parseInt(testResult[1]));

      let testResults = {
        totalTests,
        totalPassed,
      }
      
      process.stdout.write(`\n${testResults}`);
      process.stdout.write(`\n${assignmentName}`);
      process.stdout.write(`\n${repoName}`);
      process.stdout.write(`\n${studentUserName}`);

      const {data: score} = await axios.post(
        `${ACCIO_API_ENDPOINT}/github/get-score`,
        {
          token,
          testResults,
          assignmentName,
          repoName,
          studentGithubUserName: studentUserName
        }
      );
    }
    
    if (error instanceof Error) core.setFailed(error.message);
    process.stderr.write(`\nError: ${(error as Error).message}`);
    process.exit(1);
  }
}

run();