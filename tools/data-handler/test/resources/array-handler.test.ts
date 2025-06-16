// testing
import { expect } from 'chai';

import { ArrayHandler } from '../../src/resources/array-handler.js';

const testObject1 = {
  first: 'value1',
  second: 'value1',
};
const testObject2 = {
  first: 'value2',
  second: 'value2',
};

const testStringArray = ['first', 'second'];
const testNumberArray = [0, 1];
const testObjectArray = [testObject1, testObject2];

describe('array handler', () => {
  const numberArrayHandler = new ArrayHandler<number>();
  const stringArrayHandler = new ArrayHandler<string>();
  const objectArrayHandler = new ArrayHandler<typeof testObject1>();

  describe('handle add', () => {
    it('string array', () => {
      const changedArray = stringArrayHandler.handleArray(
        { name: 'add', target: 'three' },
        testStringArray,
      );
      expect(changedArray.at(2)).to.equal('three');
    });
    it('number array', () => {
      const changedArray = numberArrayHandler.handleArray(
        { name: 'add', target: 3 },
        testNumberArray,
      );
      expect(changedArray.at(2)).to.equal(3);
    });
    it('object array', () => {
      const changedArray = objectArrayHandler.handleArray(
        {
          name: 'add',
          target: { first: 'value3', second: 'value3' },
        },
        testObjectArray,
      );
      const newElement = changedArray.at(2);
      expect(newElement?.first).to.equal('value3');
      expect(newElement?.second).to.equal('value3');
    });
    it('try to add duplicate string', () => {
      expect(() =>
        stringArrayHandler.handleArray(
          { name: 'add', target: 'second' },
          testStringArray,
        ),
      ).to.throw(`Item '"second"' already exists`);
    });
    it('try to add duplicate object', () => {
      expect(() =>
        objectArrayHandler.handleArray(
          { name: 'add', target: testObject2 },
          testObjectArray,
        ),
      ).to.throw(`Item '{"first":"value2","second":"value2"}' already exists`);
    });
    it('try to add duplicate number', () => {
      expect(() =>
        numberArrayHandler.handleArray(
          { name: 'add', target: 1 },
          testNumberArray,
        ),
      ).to.throw(`Item '1' already exists`);
    });
  });

  describe('handle change', () => {
    it('string array', () => {
      const changedArray = stringArrayHandler.handleArray(
        { name: 'change', target: 'second', to: 'newSecond' },
        testStringArray,
      );
      expect(changedArray.at(1)).to.equal('newSecond');
    });
    it('number array', () => {
      const changedArray = numberArrayHandler.handleArray(
        { name: 'change', target: 0, to: 99 },
        testNumberArray,
      );
      expect(changedArray.at(0)).to.equal(99);
    });
    it('object array', () => {
      const changedArray = objectArrayHandler.handleArray(
        { name: 'change', target: testObject1, to: { first: '', second: '' } },
        testObjectArray,
      );
      const changedElement = changedArray.at(0);
      expect(changedElement?.first).to.equal('');
      expect(changedElement?.second).to.equal('');
    });
    it('object element not in array', () => {
      expect(() =>
        objectArrayHandler.handleArray(
          {
            name: 'change',
            target: { first: '', second: '' },
            to: { first: '', second: '' },
          },
          testObjectArray,
        ),
      ).to.throw(`Item '{"first":"","second":""}' not found`);
    });
  });

  describe('handle remove', () => {
    it('string array', () => {
      const changedArray = stringArrayHandler.handleArray(
        { name: 'remove', target: 'second' },
        testStringArray,
      );
      expect(changedArray.length).to.equal(1);
    });
    it('number array', () => {
      const changedArray = numberArrayHandler.handleArray(
        { name: 'remove', target: 1 },
        testNumberArray,
      );
      expect(changedArray.length).to.equal(1);
    });
    it('object array', () => {
      const changedArray = objectArrayHandler.handleArray(
        { name: 'remove', target: testObject2 },
        testObjectArray,
      );
      expect(changedArray.length).to.equal(1);
    });
    it('string element not in array', () => {
      expect(() =>
        stringArrayHandler.handleArray(
          { name: 'remove', target: 'wrongOne' },
          testStringArray,
        ),
      ).to.throw(`Item '"wrongOne"' not found`);
    });
    it('object element not in array', () => {
      expect(() =>
        objectArrayHandler.handleArray(
          { name: 'remove', target: { first: 'wrong', second: 'wrong' } },
          testObjectArray,
        ),
      ).to.throw(`Item '{"first":"wrong","second":"wrong"}' not found`);
    });
    it('number element not in array', () => {
      expect(() =>
        numberArrayHandler.handleArray(
          { name: 'remove', target: 99 },
          testNumberArray,
        ),
      ).to.throw(`Item '99' not found`);
    });
  });

  describe('handle rank', () => {
    it('string array', () => {
      const changedArray = stringArrayHandler.handleArray(
        { name: 'rank', target: 'second', newIndex: 0 },
        testStringArray,
      );
      expect(changedArray).to.not.be.equal(testStringArray);
      expect(changedArray.at(0)).to.equal('second');
      expect(changedArray.at(1)).to.equal('first');
    });
    it('number array', () => {
      const changedArray = numberArrayHandler.handleArray(
        { name: 'rank', target: 1, newIndex: 0 },
        testNumberArray,
      );
      expect(changedArray).to.not.be.equal(testNumberArray);
      expect(changedArray.at(0)).to.equal(1);
      expect(changedArray.at(1)).to.equal(0);
    });
    it('object array', () => {
      const changedArray = objectArrayHandler.handleArray(
        {
          name: 'rank',
          target: testObject1,
          newIndex: 1,
        },
        testObjectArray,
      );
      expect(changedArray).to.not.be.equal(testNumberArray);
      expect(changedArray.at(0)).to.equal(testObject2);
      expect(changedArray.at(1)).to.equal(testObject1);
    });
    it('element not in string array', () => {
      expect(() =>
        stringArrayHandler.handleArray(
          { name: 'rank', target: 'three', newIndex: 0 },
          testStringArray,
        ),
      ).to.throw(`Item '"three"' not found`);
    });
    it('element not in number array', () => {
      expect(() =>
        numberArrayHandler.handleArray(
          { name: 'rank', target: 3, newIndex: 0 },
          testNumberArray,
        ),
      ).to.throw(`Item '3' not found`);
    });
    it('element not in object array', () => {
      expect(() =>
        objectArrayHandler.handleArray(
          {
            name: 'rank',
            target: {
              first: 'value3',
              second: 'value3',
            },
            newIndex: 0,
          },
          testObjectArray,
        ),
      ).to.throw(`Item '{"first":"value3","second":"value3"}' not found`);
    });
    it('incorrect new index', () => {
      expect(() =>
        objectArrayHandler.handleArray(
          {
            name: 'rank',
            target: testObject1,
            newIndex: 99,
          },
          testObjectArray,
        ),
      ).to.throw('Invalid target index: 99');
    });
  });
});
