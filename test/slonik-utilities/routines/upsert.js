// @flow

import test from 'ava';
import sinon from 'sinon';
import upsert from '../../../src/routines/upsert';
import normalizeQuery from '../../helpers/normalizeQuery';

const createConnection = () => {
  const query = sinon.stub();

  const connection = {
    maybeOneFirst: query,
    oneFirst: query,
    query
  };

  return connection;
};

test('first attempts SELECT using named value bindings', async (t) => {
  const connection = createConnection();

  connection.query.onCall(0).returns(1);

  const recordId = await upsert(
    connection,
    'foo',
    {
      bar: 'baz'
    },
    [
      'bar'
    ]
  );

  t.assert(recordId === 1);

  t.assert(connection.query.callCount === 1);

  t.assert(normalizeQuery(connection.query.firstCall.args[0].sql) === 'SELECT "id" FROM "foo" WHERE ("bar" = $1)');
  t.deepEqual(connection.query.firstCall.args[0].values, [
    'baz'
  ]);
});

test('throws an error if named value binding value is undefined', async (t) => {
  const connection = createConnection();

  await t.throwsAsync(async () => {
    await upsert(
      connection,
      'foo',
      {
        // $FlowFixMe
        bar: undefined
      },
      [
        'bar'
      ]
    );
  }, 'Named value binding values must be defined.');
});

test('executes INSERT .. DO UPDATE if SELECT returns NULL and update column names are defined', async (t) => {
  const connection = createConnection();

  connection.query.onCall(0).returns(null);
  connection.query.onCall(1).returns(1);

  const recordId = await upsert(
    connection,
    'foo',
    {
      bar: 'baz',
      qux: 'quux'
    },
    [
      'bar'
    ]
  );

  t.assert(recordId === 1);

  t.assert(connection.query.callCount === 2);

  t.assert(normalizeQuery(connection.query.secondCall.args[0].sql) === 'INSERT INTO "foo" ("bar", "qux") VALUES ($1, $2) ON CONFLICT ("bar") DO UPDATE SET "qux" = EXCLUDED."qux" RETURNING "id"');
  t.deepEqual(connection.query.secondCall.args[0].values, [
    'baz',
    'quux'
  ]);
});

test('executes INSERT .. DO NOTHING followed by SELECT if SELECT returns NULL and update column names are not defined', async (t) => {
  const connection = createConnection();

  connection.query.onCall(0).returns(null);
  connection.query.onCall(1).returns(null);
  connection.query.onCall(2).returns(1);

  const recordId = await upsert(
    connection,
    'foo',
    {
      bar: 'baz'
    },
    [
      'bar'
    ]
  );

  t.assert(recordId === 1);

  t.assert(connection.query.callCount === 3);

  t.assert(normalizeQuery(connection.query.secondCall.args[0].sql) === 'INSERT INTO "foo" ("bar") VALUES ($1) ON CONFLICT ("bar") DO NOTHING');
  t.deepEqual(connection.query.secondCall.args[0].values, [
    'baz'
  ]);

  t.assert(normalizeQuery(connection.query.thirdCall.args[0].sql) === 'SELECT "id" FROM "foo" WHERE ("bar" = $1)');
  t.deepEqual(connection.query.thirdCall.args[0].values, [
    'baz'
  ]);
});

test('uses unique constraint column name values and update column name values to create the SELECT condition', async (t) => {
  const connection = createConnection();

  connection.query.onCall(0).returns(1);

  await upsert(
    connection,
    'foo',
    {
      bar0: 'baz0',
      bar1: 'baz1',
      bar2: 'baz2'
    },
    [
      'bar_0',
      'bar_1'
    ]
  );

  t.assert(connection.query.callCount === 1);

  t.assert(normalizeQuery(connection.query.firstCall.args[0].sql) === 'SELECT "id" FROM "foo" WHERE ("bar_0" = $1 AND "bar_1" = $2 AND "bar_2" = $3)');
  t.deepEqual(connection.query.firstCall.args[0].values, [
    'baz0',
    'baz1',
    'baz2'
  ]);
});

test('converts named value bindings to snake case (SELECT)', async (t) => {
  const connection = createConnection();

  connection.query.onCall(0).returns(1);

  await upsert(
    connection,
    'foo',
    {
      barBaz: 'baz'
    },
    [
      'bar_baz'
    ]
  );

  t.assert(connection.query.callCount === 1);

  t.assert(normalizeQuery(connection.query.firstCall.args[0].sql) === 'SELECT "id" FROM "foo" WHERE ("bar_baz" = $1)');
  t.deepEqual(connection.query.firstCall.args[0].values, [
    'baz'
  ]);
});

test('converts named value bindings to snake case (INSERT)', async (t) => {
  const connection = createConnection();

  connection.query.onCall(0).returns(null);
  connection.query.onCall(1).returns(1);

  await upsert(
    connection,
    'foo',
    {
      barBaz: 'baz',
      quxQuux: 'quux'
    },
    [
      'bar_baz'
    ]
  );

  t.assert(connection.query.callCount === 2);

  t.assert(normalizeQuery(connection.query.secondCall.args[0].sql) === 'INSERT INTO "foo" ("bar_baz", "qux_quux") VALUES ($1, $2) ON CONFLICT ("bar_baz") DO UPDATE SET "qux_quux" = EXCLUDED."qux_quux" RETURNING "id"');
  t.deepEqual(connection.query.secondCall.args[0].values, [
    'baz',
    'quux'
  ]);
});

test('throws if named value bindings object does not have properties', async (t) => {
  const connection = createConnection();

  await t.throwsAsync(async () => {
    await upsert(
      connection,
      'foo',
      {}
    );
  }, 'Named value bindings object must have properties.');
});

test('throws if unique contraint column names contain values not present in named value bindings', async (t) => {
  const connection = createConnection();

  await t.throwsAsync(async () => {
    await upsert(
      connection,
      'foo',
      {
        bar: 'baz'
      },
      [
        'qux'
      ]
    );
  }, 'Unique constraint column names must not contain column names not present in named value bindings.');
});
