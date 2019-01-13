'use strict';

const assert = require('assert');

module.exports = async config => {
    if (!global.sbtest) {
        global.sbtest = {
            sequence: Promise.resolve()
        };
    
        if (process.env.SBTEST_RESULT_HANDLER) {
            if (require('path').isAbsolute(
                    process.env.SBTEST_RESULT_HANDLER)) {
                throw new Error(
                        'SB_TEST_RESULT_HANDLER must be an absolute path.');
            }
        }
        
        const modulePath =
                process.env.SBTEST_RESULT_HANDLER || './basic-result-handler';
        global.sbtest.resultHandler = require(modulePath)();
    }
    
    config.resultHandler = config.resultHandler || global.sbtest.resultHandler;
    config.merger = config.merger || defaultMerger;
    config.transformer = (config.transformer) || (t => t);
    
    global.sbtest.sequence = global.sbtest.sequence
    .then(() => runCases([], [], config.cases, config))
    .then(() => {
        if (module.parent === require.main) {
            // We were called directly by the main module.  If we're using the
            // default result handler, let's finalize it.
            
            if (config.resultHandler === global.sbtest.resultHandler) {
                config.resultHandler.finalize();
            }
        }
    });
    
    await global.sbtest.sequence;
};

async function runCases(path, stack, descriptionList, config) {
    if (!Array.isArray(descriptionList)) {
        const e = new Error('Expected a list of test descriptions.');
        e.stack = listOrigin;
        throw e;
    }
    
    const siblingLabels = {};
    for (let i = 0; i < descriptionList.length; i++) {
        const testDescription = descriptionList[i];
        
        if (!('label' in testDescription)) {
            throw new Error(`Child ${i} of ${renderPath(path)} does not ` +
                    `have a label.`);
        }
        
        if (siblingLabels[testDescription.label]) {
            throw new Error(`Child ${i} of ${renderPath(path)} has a ` +
                    `non-unique label: ${testDescription.label}`);
        }
        
        siblingLabels[testDescription.label] = true;
    
        stack.push(testDescription);
        path.push(testDescription.label);
        if (testDescription.childTests) {
            await runCases(path, stack, testDescription.childTests, config);
        }
        else {
            // A leaf test.  Let's run it!
            let mergerResult = config.merger(stack);
            let transformerResult = config.transformer(mergerResult);
            const concreteTestDescription = transformerResult || mergerResult;
            
            await runTest(path, concreteTestDescription, config);
        }
        path.pop();
        stack.pop();
    }
}

function defaultMerger(path) {
    const result = {};
    
    path.forEach(level => {
        Object.keys(level).forEach(key => {
            switch (key) {
                case 'label': {
                    if ('label' in result) {
                        result.label = result.label + ' - ' + level.label;
                    }
                    else {
                        result.label = level.label;
                    }
                    break;
                };
                case 'childTests': {
                    // Do nothing.  Result shouldn't get this value.
                    break;
                }
                default: {
                    result[key] = level[key];
                    break;
                }
            }
        });
    });
    
    return result;
}

async function runTest(path, concreteTestDescription, config) {
    let testResult, assertions;
    
    try {
        [testResult, assertions] =
                await getTestResult(concreteTestDescription, config);        
    }
    catch (e) {
        await config.resultHandler.error(path.slice(), e);
    }
    
    if (assertions !== undefined) {
        try {
            for (let i = 0; i < assertions.length; i++) {
                await (assertions[i](testResult));
            }
            
            await config.resultHandler.success(path.slice());
        }
        catch (e) {
            if (e.code !== 'ERR_ASSERTION') {
                // Assertions should only throw assertion errors.
                throw e;
            }
            
            await config.resultHandler.failure(path.slice(), e);
        }
    }
}

async function getTestResult(concreteTestDescription, config) {
    let assertions;
    let testResult;

    try {
        const runner = concreteTestDescription.runner || config.runner;
        testResult = await runner(concreteTestDescription);
        
        if (concreteTestDescription.errorAssertions) {
            assertions = [() => {
                throw new assert.AssertionError({
                    message: 'Expected an error, but returned successfully.',
                    actual: testResult
                });
            }];
        }
        else {
            assertions = concreteTestDescription.assertions || [];
        }
    }
    catch (e) {
        testResult = e;
        
        if (concreteTestDescription.errorAssertions) {
            assertions = concreteTestDescription.errorAssertions;
        }
        else {
            throw e;
        }
    }
    
    if (!Array.isArray(assertions)) {
        assertions = [assertions];
    }
    
    return [testResult, assertions];
}

function renderPath(path) {
    let result;
    if (path.length === 0) {
        result = 'root';
    }
    else {
        result = '';
        
        path.forEach(pathPart => {
            if (result !== '') {
                result += ' - ';
            }
            
            result += pathPart;
        });
    }
    
    return result;
}
